const express = require('express');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const db = admin.firestore();
const router = express.Router();

const multer = require('multer');
const cloudinary = require('./cloudinary');
const { Storage } = require('@google-cloud/storage');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/add', upload.single('image'), async (req, res) => {
    try {
        const { id_vendor, rating, id_client, message } = req.body;

        if (!id_vendor || rating === undefined) {
            return res.status(400).json({ status: 'error', message: 'id_vendor dan rating diperlukan' });
        }

        if (id_client === undefined) {
            return res.status(400).json({ status: 'error', message: 'id_client diperlukan' });
        }

        const id = `${id_vendor}_${id_client}`;

        const existingDoc = await db.collection('ratings').doc(id).get();

        let imageUrl = "";
        if (existingDoc.exists) {
            imageUrl = existingDoc.data().imageUrl || "";
        }

        const ratingData = {
            id_vendor,
            rating: parseFloat(rating),
            id_client,
            message: message || "",
            imageUrl
        };

        if (req.file) {
            cloudinary.uploader.upload_stream({ resource_type: 'image' }, async (error, result) => {
                if (error) {
                    console.error('Error:', error);
                    return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat mengunggah gambar' });
                }
                ratingData.imageUrl = result.secure_url;
                await db.collection('ratings').doc(id).set(ratingData);
                return res.status(201).json({ status: 'success', message: 'Rating berhasil ditambahkan' });
            }).end(req.file.buffer);
        } else {
            // If no new image is provided, keep the previous image URL
            await db.collection('ratings').doc(id).set(ratingData);
            return res.status(201).json({ status: 'success', message: 'Rating berhasil ditambahkan' });
        }
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan rating' });
    }
});
module.exports = router;

router.get('/view/:id_vendor', async (req, res) => {
    try {
        const { id_vendor } = req.params;

        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', id_vendor).get();

        if (ratingsSnapshot.empty) {
            return res.status(404).json({ status: 'error', message: 'Tidak ada rating untuk vendor ini' });
        }

        let totalRating = 0;
        let ratingCount = 0;

        ratingsSnapshot.forEach(doc => {
            totalRating += doc.data().rating;
            ratingCount++;
        });

        const averageRating = (totalRating / ratingCount).toFixed(1);

        return res.status(200).json({ status: 'success', rating: averageRating });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat rating' });
    }
});

router.get('/view_by_client', async (req, res) => {
    try {
        const { id_vendor, id_client } = req.query;

        if (!id_vendor || !id_client) {
            return res.status(400).json({ status: 'error', message: 'id_vendor and id_client are required' });
        }

        const ratingSnapshot = await db.collection('ratings')
            .where('id_vendor', '==', id_vendor)
            .where('id_client', '==', id_client)
            .get();

        if (ratingSnapshot.empty) {
            return res.status(200).json({ status: 'success', message: 'Tidak ada rating yang kamu berikan', data: null });
        }

        return res.status(200).json({ status: 'success', message: 'Terdapat rating yang kamu berikan', data: ratingSnapshot.docs[0].data() });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat mengambil rating', data: null });
    }
});

module.exports = router;
