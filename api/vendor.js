const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('./cloudinary'); 
const streamifier = require('streamifier'); 

const db = admin.firestore();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

async function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream((error, result) => {
            if (result) {
                resolve(result);
            } else {
                reject(error);
            }
        });
        streamifier.createReadStream(buffer).pipe(uploadStream);
    });
}


router.post('/add', upload.array('portofolio', 10), async (req, res) => {
    try {
        const {
            id,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_layanan,
            iklan_persetujuan,
            fee_minimum
        } = req.body;

        const userRef = db.collection('users').doc(id);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({
                status: "error",
                message: 'Data user tidak ditemukan',
                data: id
            });
        }

        const userData = doc.data();

        const tipeLayananArray = Array.isArray(tipe_layanan) ? tipe_layanan : [tipe_layanan];
        const jasaKontraktorArray = Array.isArray(jasa_kontraktor) ? jasa_kontraktor : [jasa_kontraktor];

        let portofolioUrls = [];
        if (req.files) {
            const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
            const results = await Promise.all(uploadPromises);
            portofolioUrls = results.map(result => result.secure_url);
        }

        await db.collection('vendors').doc(id).set({
            id,
            tipe_layanan: tipeLayananArray,
            jenis_properti,
            jasa_kontraktor: jasaKontraktorArray,
            lokasi_kantor,
            deskripsi_layanan,
            profile: userData.profile,
            portofolio: portofolioUrls,
            iklan_persetujuan,
            fee_minimum
        });

        return res.status(201).json({ status: 'success', message: 'Data vendor berhasil ditambahkan' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan data vendor' });
    }
});


function calculateAverageRating(ratingsSnapshot) {
    if (ratingsSnapshot.empty) {
        return 0;
    }
    const ratings = ratingsSnapshot.docs.map(doc => doc.data().rating);
    const totalRating = ratings.reduce((sum, rating) => sum + rating, 0);
    return totalRating / ratings.length;
}


router.get('/all', async (req, res) => {
    try {
        const vendorsSnapshot = await db.collection('vendors').get();

        const vendorsList = await Promise.all(vendorsSnapshot.docs.map(async (doc) => {
            let data = doc.data();

            const userSnapshot = await db.collection('users').doc(data.id).get();
            if (userSnapshot.exists) {
                const userData = userSnapshot.data();
                data.pemilik_info = {
                    email: userData.email,
                    nama: userData.nama,
                    no_hp: userData.no_hp
                };
            }

            const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();
            data.rating = calculateAverageRating(ratingsSnapshot);

            return data;
        }));

        return res.status(200).json(vendorsList);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat mengambil data vendor' });
    }
});


router.get('/filter', async (req, res) => {
    try {
        const { tipe_layanan, lokasi_kantor, rating, jenis_jasa, harga_minimum, harga_maksimum, nama_vendor } = req.query;

        const filterOptions = {
            tipe_layanan: tipe_layanan ? tipe_layanan.toLowerCase().trim().split(',') : [],
            lokasi_kantor: lokasi_kantor ? lokasi_kantor.toLowerCase().trim() : '',
            rating: rating ? parseFloat(rating.toLowerCase().trim()) : '',
            jenis_jasa: jenis_jasa ? jenis_jasa.toLowerCase().trim().split(',') : [],
            harga_minimum: harga_minimum ? parseFloat(harga_minimum.toLowerCase().trim()) : '',
            harga_maksimum: harga_maksimum ? parseFloat(harga_maksimum.toLowerCase().trim()) : '',
            nama_vendor: nama_vendor ? nama_vendor.toLowerCase().trim() : ''
        };

        const vendorsSnapshot = await db.collection('vendors').get();

        const vendorsList = await Promise.all(vendorsSnapshot.docs.map(async (doc) => {
            const data = doc.data();
            let matches = true;

            const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();
            const averageRating = calculateAverageRating(ratingsSnapshot);

            if (filterOptions.tipe_layanan.length > 0) {
                if (data.tipe_layanan && Array.isArray(data.tipe_layanan)) {
                    const tipeLayananArray = data.tipe_layanan.map(item => item.toLowerCase());
                    const matchesTipeLayanan = filterOptions.tipe_layanan.every(option => tipeLayananArray.includes(option));
                    if (!matchesTipeLayanan) {
                        matches = false;
                    }
                } else {
                    matches = false;
                }
            }

            if (filterOptions.lokasi_kantor && data.lokasi_kantor && data.lokasi_kantor.toLowerCase() !== filterOptions.lokasi_kantor) {
                matches = false;
            }

            if (filterOptions.rating && averageRating < filterOptions.rating) {
                matches = false;
            }

            if (filterOptions.jenis_jasa.length > 0) {
                if (data.jasa_kontraktor && Array.isArray(data.jasa_kontraktor)) {
                    const jenisJasaArray = data.jasa_kontraktor.map(item => item.toLowerCase());
                    const matchesJenisJasa = filterOptions.jenis_jasa.every(option => jenisJasaArray.includes(option));
                    if (!matchesJenisJasa) {
                        matches = false;
                    }
                } else {
                    matches = false;
                }
            }

            if (filterOptions.nama_vendor && data.nama_vendor) {
                const vendorName = data.nama_vendor.toLowerCase();
                if (!vendorName.includes(filterOptions.nama_vendor)) {
                    matches = false;
                }
            }

            if (filterOptions.harga_minimum && data.harga && data.harga < filterOptions.harga_minimum) {
                matches = false;
            }
            if (filterOptions.harga_maksimum && data.harga && data.harga > filterOptions.harga_maksimum) {
                matches = false;
            }

            if (matches) {
                const userSnapshot = await db.collection('users').doc(data.id).get();
                if (userSnapshot.exists) {
                    const userData = userSnapshot.data();
                    data.pemilik_info = {
                        email: userData.email,
                        nama: userData.nama,
                        no_hp: userData.no_hp
                    };
                }
                data.rating = averageRating;
                return data;
            }
            return null;
        }));

        const filteredVendorsList = vendorsList.filter(vendor => vendor !== null);

        return res.status(200).json(filteredVendorsList);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melakukan filter data vendor' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const vendorRef = db.collection('vendors').doc(id);
        const doc = await vendorRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: 'error', message: 'Data vendor tidak ditemukan' });
        }

        const data = doc.data();
        
        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();
        data.rating = calculateAverageRating(ratingsSnapshot);

        const userSnapshot = await db.collection('users').doc(data.id).get();
        if (userSnapshot.exists) {
            const userData = userSnapshot.data();
            data.pemilik_info = {
                email: userData.email,
                nama: userData.nama,
                no_hp: userData.no_hp
            };
        }

        return res.status(200).json(data);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat mengambil detail data vendor' });
    }
});


router.put('/:id', upload.array('portofolio', 10), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            userId,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_layanan,
            iklan_persetujuan,
            fee_minimum
        } = req.body;

        const vendorRef = db.collection('vendors').doc(id);
        const doc = await vendorRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: 'error', message: 'Data vendor tidak ditemukan' });
        }

        const vendorData = doc.data();

        let portofolioUrls = vendorData.portofolio || [];
        if (req.files && req.files.length > 0) {
            const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
            const results = await Promise.all(uploadPromises);
            const newUrls = results.map(result => result.secure_url);
            portofolioUrls = portofolioUrls.concat(newUrls);
        }

        const tipeLayananArray = tipe_layanan ? (Array.isArray(tipe_layanan) ? tipe_layanan : [tipe_layanan]) : vendorData.tipe_layanan;
        const jasaKontraktorArray = jasa_kontraktor ? (Array.isArray(jasa_kontraktor) ? jasa_kontraktor : [jasa_kontraktor]) : vendorData.jasa_kontraktor;

        const updatedData = {
            ...(userId && { userId }),
            tipe_layanan: tipeLayananArray,
            ...(jenis_properti && { jenis_properti }),
            jasa_kontraktor: jasaKontraktorArray,
            ...(lokasi_kantor && { lokasi_kantor }),
            ...(deskripsi_layanan && { deskripsi_layanan }),
            ...(iklan_persetujuan && { iklan_persetujuan }),
            ...(fee_minimum && { fee_minimum }),
            portofolio: portofolioUrls
        };

        await vendorRef.update(updatedData);

        return res.status(200).json({ status: 'success', message: 'Data vendor berhasil diperbarui' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat memperbarui data vendor' });
    }
});


router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('id del:', id); 
        const vendorRef = db.collection('vendors').doc(id);
        const vendorSnapshot = await vendorRef.get();
        
        if (!vendorSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Vendor tidak ditemukan' });
        }

        await vendorRef.delete();

        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', id).get();
        const deletePromises = ratingsSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);

        return res.status(200).json({ status: 'success', message: 'Vendor dan rating terkait berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghapus data vendor' });
    }
});



router.get("/", (req, res) => {
    res.json({
        status: "error",
        message: "no query"
    });
});

module.exports = router;
