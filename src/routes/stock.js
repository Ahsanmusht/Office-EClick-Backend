const express = require('express');
const router = express.Router();
const StockController = require('../controllers/StockController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Get all stock with filters (supports warehouse_id=0 for all)
router.get('/', auth, checkPermission('stock.view'), StockController.getAllStock);

// Get specific stock by product and warehouse
router.get('/product/:product_id/warehouse/:warehouse_id', auth, checkPermission('stock.view'), StockController.getStock);

// Stock movements/history
router.get('/movements', auth, checkPermission('stock.view'), StockController.getHistory);

// Stock alerts
router.get('/alerts', auth, checkPermission('stock.view'), StockController.getAlerts);

// Adjust stock
router.post('/adjust', auth, checkPermission('stock.adjust'), StockController.adjustStock);

// Transfer stock between warehouses
router.post('/transfer', auth, checkPermission('stock.transfer'), StockController.transferStock);

module.exports = router;