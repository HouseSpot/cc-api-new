const express = require('express');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Inisialisasi Firebase Admin SDK
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const router = express.Router();

// Storage untuk menyimpan foto portofolio
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const hash = crypto.createHash('sha256').update(file.originalname).digest('hex');
        const fileExt = path.extname(file.originalname);
        cb(null, `${hash}${fileExt}`);
    }
});

// Filter untuk hanya menerima file dengan tipe gambar
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Hanya diperbolehkan mengunggah file gambar'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

router.get("/", (req, res) => {
    res.json({
        status: "error",
        message: "no query"
    });
});

router.post('/daftar', upload.single('profile'), async (req, res) => {
    try {
        const { email, nama, no_hp, peran, password, confirmPassword } = req.body;

        // Generate URL for profile photo
        let profileUrl = '';
        if (req.file) {
            const filePath = req.file.path;
            profileUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
        }

        if (!email || !nama || !no_hp || !peran || !password || !confirmPassword) {
            return res.status(400).json({
                status: "error",
                message: 'Semua kolom harus diisi'
            });
        } else if (password !== confirmPassword) {
            return res.status(400).json({
                status: "error",
                message: 'Password dan Confirm Password tidak sama'
            });
        }

        // Encrypt password using bcrypt
        const hashedPassword = await bcrypt.hash(password, 10);

        // Use email to check if the user already exists
        const usersRef = db.collection('users');
        const querySnapshot = await usersRef.where('email', '==', email).get();

        if (!querySnapshot.empty) {
            return res.status(400).json({
                status: "error",
                message: 'User dengan email yang sama sudah ada'
            });
        }

        // Add user data to Firestore with a generated ID
        const id = uuidv4();
        await usersRef.doc(id).set({
            id,
            email,
            nama,
            no_hp,
            peran,
            password: hashedPassword,
            profile: profileUrl
        });

        return res.status(201).json({
            status: "success",
            message: 'Data user berhasil ditambahkan'
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: "error",
            message: 'Terjadi kesalahan saat menambahkan data user'
        });
    }
});

// GET data user berdasarkan id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const userRef = db.collection('users').doc(id);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: "error", message: 'Data user tidak ditemukan' });
        }

        const userData = doc.data();
        return res.status(200).json(userData);
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: "error", message: 'Terjadi kesalahan saat mengambil data user' });
    }
});

// UPDATE data user berdasarkan id
router.put('/update/:id', upload.single('profile'), async (req, res) => {
    try {
        const { id } = req.params;
        const { nama, peran, no_hp, password } = req.body;

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

        // Menghasilkan URL foto portofolio
        let profileUrl = userData.profile;
        if (req.file) {
            const filePath = req.file.path;
            profileUrl = `${req.protocol}://${req.get('host')}/${filePath}`;
        }

        // Memeriksa setiap nilai yang dikirim melalui req.body
        const updatedData = {
            nama: nama || userData.nama,
            no_hp: no_hp || userData.no_hp,
            peran: peran || userData.peran,
            profile: profileUrl || userData.profile,
            password: password ? await bcrypt.hash(password, 10) : userData.password
        };

        // Update data user
        await userRef.update(updatedData);

        return res.status(200).json({
            status: "success",
            message: 'Data user berhasil diperbarui',
            data: id
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: "error",
            message: 'Terjadi kesalahan saat memperbarui data user',
            data: id
        });
    }
});

// DELETE data user berdasarkan id
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const userRef = db.collection('users').doc(id);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: "error", message: 'Data user tidak ditemukan' });
        }

        // Delete the user document
        await userRef.delete();

        // Find and delete corresponding vendor document(s) based on userId
        const vendorsRef = db.collection('vendors');
        const vendorSnapshot = await vendorsRef.where('id', '==', id).get();

        const deleteVendorPromises = vendorSnapshot.docs.map(vendorDoc => vendorDoc.ref.delete());
        await Promise.all(deleteVendorPromises);

        return res.status(200).json({ status: "success", message: 'Data user dan vendor terkait berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: "error", message: 'Terjadi kesalahan saat menghapus data user dan vendor' });
    }
});

// Authentication
router.post('/auth', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                message: 'Email dan password harus diisi'
            });
        }

        const usersRef = db.collection('users');
        const querySnapshot = await usersRef.where('email', '==', email).get();

        if (querySnapshot.empty) {
            return res.status(404).json({
                status: "error",
                message: 'Email atau password salah'
            });
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        // Memeriksa apakah password cocok
        const passwordMatch = await bcrypt.compare(password, userData.password);

        if (!passwordMatch) {
            return res.status(401).json({
                status: "error",
                message: 'Email atau password salah'
            });
        }

        // Jika email dan password cocok, beri respons berhasil
        return res.status(200).json({
            status: "success",
            message: 'Login berhasil',
            data: userData
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: "error",
            message: 'Terjadi kesalahan saat melakukan login'
        });
    }
});

module.exports = router;
