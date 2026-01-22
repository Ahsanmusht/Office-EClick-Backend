// src/routes/sales.js - UPDATED
const express = require('express');
const router = express.Router();
const UpdatedSalesController = require('../controllers/SalesController');
const auth = require('../middleware/auth');

router.get('/', UpdatedSalesController.getOrders);
router.get('/report', UpdatedSalesController.getSalesReport);
router.get('/:id', UpdatedSalesController.getOrderById);
router.post('/', auth, UpdatedSalesController.createOrder);

module.exports = router;