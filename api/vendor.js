const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const db = admin.firestore();

// Storage configuration for portfolio photos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Generate filename based on SHA256 hash
        const hash = crypto.createHash('sha256').update(file.originalname).digest('hex');
        const fileExt = path.extname(file.originalname);
        cb(null, `${hash}${fileExt}`);
    }
});

// File filter to only accept image files
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

// Menambah data vendor
router.post('/add', upload.array('portofolio', 10), async (req, res) => {
    try {
        const {
            id,
            tipe_layanan,
            jenis_properti,
            jasa_kontraktor,
            lokasi_kantor,
            deskripsi_layanan,
            iklan_persetujuan
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

        // Parse `tipe_layanan` and `jasa_kontraktor` as arrays if they are not already
        const tipeLayananArray = Array.isArray(tipe_layanan) ? tipe_layanan : [tipe_layanan];
        const jasaKontraktorArray = Array.isArray(jasa_kontraktor) ? jasa_kontraktor : [jasa_kontraktor];

        // Generate URLs for portfolio photos
        let portofolioUrls = [];
        if (req.files) {
            portofolioUrls = req.files.map(file => {
                const filePath = file.path;
                return `${req.protocol}://${req.get('host')}/${filePath}`;
            });
        }

        // Add vendor data to Firestore
        await db.collection('vendors').doc(id).set({
            id, // Linking vendor to the user
            tipe_layanan: tipeLayananArray,
            jenis_properti,
            jasa_kontraktor: jasaKontraktorArray,
            lokasi_kantor,
            deskripsi_layanan,
            profile: userData.profile,
            portofolio: portofolioUrls,
            iklan_persetujuan
        });

        return res.status(201).json({ status: 'success', message: 'Data vendor berhasil ditambahkan' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan data vendor' });
    }
});


// Helper function to calculate average rating
function calculateAverageRating(ratingsSnapshot) {
    if (ratingsSnapshot.empty) {
        return 0;
    }
    const ratings = ratingsSnapshot.docs.map(doc => doc.data().rating);
    const totalRating = ratings.reduce((sum, rating) => sum + rating, 0);
    return totalRating / ratings.length;
}


// Menampilkan semua data vendor
router.get('/all', async (req, res) => {
    try {
        const vendorsSnapshot = await db.collection('vendors').get();

        const vendorsList = await Promise.all(vendorsSnapshot.docs.map(async (doc) => {
            let data = doc.data();

            // Mengambil data pemilik dari koleksi users
            const userSnapshot = await db.collection('users').doc(data.id).get();
            if (userSnapshot.exists) {
                const userData = userSnapshot.data();
                data.pemilik_info = {
                    email: userData.email,
                    nama: userData.nama,
                    no_hp: userData.no_hp
                };
            }

            // Mengambil semua rating untuk id_vendor tertentu
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

        // Convert all query parameters to lowercase and trim spaces
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

            // Mengambil semua rating untuk id_vendor tertentu
            const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();
            const averageRating = calculateAverageRating(ratingsSnapshot);

            // Filter by Tipe Layanan
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

            // Filter by Lokasi Kantor
            if (filterOptions.lokasi_kantor && data.lokasi_kantor && data.lokasi_kantor.toLowerCase() !== filterOptions.lokasi_kantor) {
                matches = false;
            }

            // Filter by Rating
            if (filterOptions.rating && averageRating < filterOptions.rating) {
                matches = false;
            }

            // Filter by Jenis Jasa
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

            // Filter by Nama Vendor
            if (filterOptions.nama_vendor && data.nama_vendor) {
                const vendorName = data.nama_vendor.toLowerCase();
                if (!vendorName.includes(filterOptions.nama_vendor)) {
                    matches = false;
                }
            }

            // Filter by Harga Range (assuming `harga_minimum` and `harga_maksimum` fields exist in data)
            if (filterOptions.harga_minimum && data.harga && data.harga < filterOptions.harga_minimum) {
                matches = false;
            }
            if (filterOptions.harga_maksimum && data.harga && data.harga > filterOptions.harga_maksimum) {
                matches = false;
            }

            if (matches) {
                // Mengambil data pemilik dari koleksi users
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

        // Filter out null values
        const filteredVendorsList = vendorsList.filter(vendor => vendor !== null);

        return res.status(200).json(filteredVendorsList);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melakukan filter data vendor' });
    }
});

// Menampilkan detail data vendor berdasarkan id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const vendorRef = db.collection('vendors').doc(id);
        const doc = await vendorRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: 'error', message: 'Data vendor tidak ditemukan' });
        }

        const data = doc.data();
        
        // Mengambil semua rating untuk id_vendor tertentu
        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', data.id).get();
        data.rating = calculateAverageRating(ratingsSnapshot);

        // Mengambil data pemilik dari koleksi users berdasarkan id
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



// Update data vendor berdasarkan id
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
            iklan_persetujuan
        } = req.body;

        const vendorRef = db.collection('vendors').doc(id);
        const doc = await vendorRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: 'error', message: 'Data vendor tidak ditemukan' });
        }

        const vendorData = doc.data();

        // Generate URLs for portfolio photos
        let portofolioUrls = vendorData.portofolio;
        if (req.files && req.files.length > 0) {
            portofolioUrls = req.files.map(file => {
                const filePath = file.path;
                return `${req.protocol}://${req.get('host')}/${filePath}`;
            });
        }

        // Parse `tipe_layanan` and `jasa_kontraktor` as arrays if they are not already
        const tipeLayananArray = tipe_layanan ? (Array.isArray(tipe_layanan) ? tipe_layanan : [tipe_layanan]) : vendorData.tipe_layanan;
        const jasaKontraktorArray = jasa_kontraktor ? (Array.isArray(jasa_kontraktor) ? jasa_kontraktor : [jasa_kontraktor]) : vendorData.jasa_kontraktor;

        // Update data vendor only if certain fields are provided in the request
        const updatedData = {
            ...(userId && { userId }),
            tipe_layanan: tipeLayananArray,
            ...(jenis_properti && { jenis_properti }),
            jasa_kontraktor: jasaKontraktorArray,
            ...(lokasi_kantor && { lokasi_kantor }),
            ...(deskripsi_layanan && { deskripsi_layanan }),
            ...(iklan_persetujuan && { iklan_persetujuan }),
            portofolio: portofolioUrls
        };

        await vendorRef.update(updatedData);

        return res.status(200).json({ status: 'success', message: 'Data vendor berhasil diperbarui' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat memperbarui data vendor' });
    }
});




// Hapus data vendor berdasarkan id
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

        // Menghapus rating terkait
        const ratingsSnapshot = await db.collection('ratings').where('id_vendor', '==', id).get();
        const deletePromises = ratingsSnapshot.docs.map(doc => doc.ref.delete());
        await Promise.all(deletePromises);

        return res.status(200).json({ status: 'success', message: 'Vendor dan rating terkait berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghapus data vendor' });
    }
});



// Default route for no query
router.get("/", (req, res) => {
    res.json({
        status: "error",
        message: "no query"
    });
});

module.exports = router;
