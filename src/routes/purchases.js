// src/routes/purchases.js - UPDATED

const express = require('express');
const router = express.Router();
const UpdatedPurchaseController = require('../controllers/PurchaseController');
const auth = require('../middleware/auth');

// Purchase Orders - Original
router.get('/', UpdatedPurchaseController.getOrders);
router.get('/:id', UpdatedPurchaseController.getOrderById);
router.post('/', auth, UpdatedPurchaseController.createOrder);

// NEW - Production Flow
router.get('/production/pending', UpdatedPurchaseController.getPendingProductionOrders);
router.get('/production/:id/details', UpdatedPurchaseController.getPurchaseForProduction);
router.post('/production/process', auth, UpdatedPurchaseController.processProduction);
router.get('/production/history', UpdatedPurchaseController.getProductionHistory);
router.post('/production/single', auth, UpdatedPurchaseController.processSingleProductProduction);
router.get('/production/:purchase_order_id/items', UpdatedPurchaseController.getPendingProductionItems);
router.get('/production/:purchase_order_id/history', UpdatedPurchaseController.getProductionHistoryByPO);

module.exports = router;