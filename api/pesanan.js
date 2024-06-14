const express = require('express');
const admin = require('firebase-admin');
const fs = require('fs');
const csv = require('csv-parser');
const { v4: uuidv4 } = require('uuid');


const db = admin.firestore();
const router = express.Router();

// Fungsi untuk membaca file CSV dan mengembalikan data sebagai array objek
const parseCsv = async (filePath) => {
    const data = [];
    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                data.push(row);
            })
            .on('end', () => {
                resolve(data);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

const calculateDistance = (row, params) => {
    const distance = Math.sqrt(
        Math.pow(row['jumlah_lantai'] - params.jumlah_lantai, 2) +
        Math.pow(row['kamar_tidur'] - params.kamar_tidur, 2) +
        Math.pow(row['kamar_mandi'] - params.kamar_mandi, 2) +
        Math.pow(row['luas_bangunan'] - params.luas_bangunan, 2) +
        Math.pow(row['luas_tanah'] - params.luas_tanah, 2) +
        Math.pow(row['jumlah_carport'] - params.jumlah_carport, 2) +
        Math.pow(row['jumlah_garage'] - params.jumlah_garage, 2)
    );
    return distance;
};

const calculateEstimatedPrice = async (params) => {
    const data = await parseCsv('./dataset/datasetprice.csv');

    const distances = data.map(row => ({
        row,
        distance: calculateDistance(row, params)
    }));

    distances.sort((a, b) => a.distance - b.distance);
    const closestRows = distances.slice(0, 3).map(({ row }) => row);

    const minRow = closestRows.reduce((prev, curr) => parseFloat(prev['price_value']) < parseFloat(curr['price_value']) ? prev : curr);
    const maxRow = closestRows.reduce((prev, curr) => parseFloat(prev['price_value']) > parseFloat(curr['price_value']) ? prev : curr);

    const currencyMin = minRow['price_currency'];
    const unitMin = minRow['price_unit'];
    const currencyMax = maxRow['price_currency'];
    const unitMax = maxRow['price_unit'];

    const minPrice = parseFloat(minRow['price_value']);
    const maxPrice = parseFloat(maxRow['price_value']);
    const priceRange = `${currencyMin}. ${minPrice.toFixed(2)} ${unitMin} - ${currencyMax}. ${maxPrice.toFixed(2)} ${unitMax}`;

    return priceRange;
};

router.post('/estimate', async (req, res) => {
    try {
        const { jumlah_lantai, kamar_tidur, kamar_mandi, luas_bangunan, luas_tanah, jumlah_carport, jumlah_garage } = req.body;

        console.log(jumlah_lantai, kamar_tidur, kamar_mandi, luas_bangunan, luas_tanah, jumlah_carport, jumlah_garage);
        if (jumlah_lantai == undefined && kamar_tidur == undefined && kamar_mandi == undefined && luas_bangunan == undefined && luas_tanah == undefined && jumlah_carport == undefined && jumlah_garage == undefined) {
            return res.status(200).json({ status: 'error', "estimatedPrice": "Rp. 0" });
        }
        const estimatedPrice = await calculateEstimatedPrice({
            jumlah_lantai,
            kamar_tidur,
            kamar_mandi,
            luas_bangunan,
            luas_tanah,
            jumlah_carport,
            jumlah_garage
        });

        return res.status(200).json({ status: 'success', estimatedPrice });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghitung estimasi harga' });
    }
});

// Tambah pesanan
router.post('/add', async (req, res) => {
    try {
        const { id_pemesan, id_vendor, serviceType, propertyType, budget, startDate, endDate, projectDescription, materialProvider } = req.body;

        const id = uuidv4();
        await db.collection('orders').doc(id).set({
            id: id,
            id_pemesan,
            id_vendor,
            serviceType,
            propertyType,
            budget,
            startDate,
            endDate,
            projectDescription,
            materialProvider,
            status: 'WAITING'
        });

        return res.status(201).json({ status: 'success', message: 'Pesanan berhasil ditambahkan', id });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menambahkan pesanan' });
    }
});

// Update pesanan
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get the existing order data from the database
        const orderRef = db.collection('orders').doc(id);
        const orderSnapshot = await orderRef.get();

        if (!orderSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        // Get the status from the request body
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ status: 'error', message: 'Status tidak diberikan' });
        }

        // Update the order status
        await orderRef.update({ status });

        return res.status(200).json({ status: 'success', message: 'Status pesanan berhasil diperbarui' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat memperbarui status pesanan' });
    }
});

// Hapus pesanan
router.delete('/delete/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const orderRef = db.collection('orders').doc(id);
        const orderSnapshot = await orderRef.get();

        if (!orderSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        await orderRef.delete();

        return res.status(200).json({ status: 'success', message: 'Pesanan berhasil dihapus' });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat menghapus pesanan' });
    }
});

// Lihat pesanan
router.get('/view/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const orderSnapshot = await db.collection('orders').doc(id).get();

        if (!orderSnapshot.exists) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        return res.status(200).json({ status: 'success', data: orderSnapshot.data() });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat pesanan' });
    }
});

// Lihat pesanan berdasarkan id_pemesan
router.get('/view_by_client/:id_pemesan', async (req, res) => {
    try {
        const { id_pemesan } = req.params;

        const ordersSnapshot = await db.collection('orders').where('id_pemesan', '==', id_pemesan).get();

        if (ordersSnapshot.empty) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan' });
        }

        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push(doc.data());
        });

        return res.status(200).json({ status: 'success', data: orders });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat pesanan' });
    }
});

// Lihat pesanan berdasarkan ID vendor
router.get('/view_by_vendor/:id_vendor', async (req, res) => {
    try {
        const { id_vendor } = req.params;

        const ordersSnapshot = await db.collection('orders').where('id_vendor', '==', id_vendor).get();

        if (ordersSnapshot.empty) {
            return res.status(404).json({ status: 'error', message: 'Pesanan tidak ditemukan untuk ID vendor yang diberikan' });
        }

        const orders = [];
        ordersSnapshot.forEach(doc => {
            orders.push(doc.data());
        });

        return res.status(200).json({ status: 'success', data: orders });
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ status: 'error', message: 'Terjadi kesalahan saat melihat pesanan berdasarkan ID vendor' });
    }
});



module.exports = router;
