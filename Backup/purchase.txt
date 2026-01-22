// src/routes/purchases.js - UPDATED
const express = require('express');
const router = express.Router();
const UpdatedPurchaseController = require('../controllers/PurchaseController');
const auth = require('../middleware/auth');

router.get('/', UpdatedPurchaseController.getOrders);
router.get('/wastage-report', UpdatedPurchaseController.getWastageReport);
router.get('/wastage-details', UpdatedPurchaseController.getPurchaseWastageDetails);
router.get('/:id', UpdatedPurchaseController.getOrderById);
router.post('/', auth, UpdatedPurchaseController.createOrder);

module.exports = router;