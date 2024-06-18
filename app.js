require('dotenv').config(); 
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');

const usersRouter = require('./api/users');
const vendorsRouter = require('./api/vendor');
const ratingRouter = require('./api/rating');
const pesananRoutes = require('./api/pesanan');

const app = express();
const port = 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware for parsing request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Use routers
app.use("/users", usersRouter);
app.use("/login", usersRouter);
app.use("/vendor", vendorsRouter);
app.use("/rating", ratingRouter);
app.use('/orders', pesananRoutes);

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
