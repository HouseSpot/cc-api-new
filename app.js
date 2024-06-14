const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');

const usersRouter = require('./api/users');
const vendorsRouter = require('./api/vendor');
const ratingRouter = require('./api/rating');
const pesananRoutes = require('./api/pesanan'); // Sesuaikan dengan path file router Anda

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware untuk memparsing body request
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Middleware untuk menangani file upload menggunakan multer
const upload = multer({ dest: 'uploads/' });

// Endpoint dasar
app.get("/", (req, res) => {
    res.json({
        status: "error",
        message: "no query"
    });
});

// Konfigurasi route static untuk file uploads
app.use('/uploads', express.static('uploads'));

// Gunakan router yang telah dibuat
app.use("/users", usersRouter);
app.use("/login", usersRouter);
app.use("/vendor", vendorsRouter);
app.use("/rating", ratingRouter);
app.use('/orders', pesananRoutes);

// Menjalankan server
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
