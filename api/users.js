const express = require('express');
const admin = require('firebase-admin');
const bcrypt = require('bcrypt');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const cloudinary = require('./cloudinary'); 
const streamifier = require('streamifier'); 

const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.get("/", (req, res) => {
    res.json({
        status: "error",
        message: "no query"
    });
});

router.post('/daftar', upload.single('profile'), async (req, res) => {
    try {
        const { email, nama, no_hp, peran, password, confirmPassword } = req.body;

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

        const hashedPassword = await bcrypt.hash(password, 10);

        const usersRef = db.collection('users');
        const querySnapshot = await usersRef.where('email', '==', email).get();

        if (!querySnapshot.empty) {
            return res.status(400).json({
                status: "error",
                message: 'User dengan email yang sama sudah ada'
            });
        }

        let profileUrl = '';
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            profileUrl = result.secure_url;
        }

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
            message: 'Data user berhasil ditambahkan',
            data: id
        });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({
            status: "error",
            message: 'Terjadi kesalahan saat menambahkan data user',
            data: null
        });
    }
});


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

        let profileUrl = userData.profile;
        if (req.file) {
            const result = await uploadToCloudinary(req.file.buffer);
            profileUrl = result.secure_url;
        }

        const updatedData = {
            nama: nama || userData.nama,
            no_hp: no_hp || userData.no_hp,
            peran: peran || userData.peran,
            profile: profileUrl || userData.profile,
            password: password ? await bcrypt.hash(password, 10) : userData.password
        };

        await userRef.update(updatedData);

        const vendorRef = db.collection('vendors').doc(id);
        const docVendor = await vendorRef.get();

        if (docVendor.exists) {
            await vendorRef.update({ profile: profileUrl || userData.profile });
        }

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

router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const userRef = db.collection('users').doc(id);
        const doc = await userRef.get();

        if (!doc.exists) {
            return res.status(404).json({ status: "error", message: 'Data user tidak ditemukan' });
        }

        await userRef.delete();

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

        const passwordMatch = await bcrypt.compare(password, userData.password);

        if (!passwordMatch) {
            return res.status(401).json({
                status: "error",
                message: 'Email atau password salah'
            });
        }

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

module.exports = router;
