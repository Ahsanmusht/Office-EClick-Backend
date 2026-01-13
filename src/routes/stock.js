const express = require('express');
const router = express.Router();
const StockController = require('../controllers/StockController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('stock.view'), StockController.getStock);
router.get('/history', auth, checkPermission('stock.view'), StockController.getHistory);
router.post('/adjust', auth, checkPermission('stock.adjust'), StockController.adjustStock);
router.post('/transfer', auth, checkPermission('stock.transfer'), StockController.transferStock);

module.exports = router;