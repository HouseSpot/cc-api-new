const express = require('express');
const admin = require('firebase-admin');
const { v4: uuidv4 } = require('uuid');

const db = admin.firestore();
const router = express.Router();

// Fungsi untuk menghasilkan ID acak sepanjang 20 karakter
const generateRandomId = () => {
    return uuidv4().replace(/-/g, '').slice(0, 20);
};

// Menambah rating
router.post('/add', async (req, res) => {
    try {
        const { id_vendor, rating } = req.body;

        // Memastikan bahwa id_vendor dan rating ada
        if (!id_vendor || rating === undefined) {
            return res.status(400).json({ status: 'error', message: 'id_vendor dan rating diperlukan' });
        }

        // Menambahkan rating ke Firestore
        const id = generateRandomId();
        await db.collection('ratings').doc(id).set({
            id_vendor,
            rating: parseFloat(rating)
        });

        return res.status(201).json({ status: 'success', message: 'Rating berhasil ditambahkan' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan rating' });
    }
});

// Melihat rating
router.get('/view/:id_vendor', async (req, res) => {
    try {
        const { id_vendor } = req.params;

        // Mengambil semua rating untuk id_vendor tertentu
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

module.exports = router;
