const express = require('express');
const router = express.Router();
const StockController = require('../controllers/StockController');
const auth = require('../middleware/auth');

router.get('/', StockController.getStock);
router.post('/adjust', auth, StockController.adjustStock);
router.post('/transfer', auth, StockController.transferStock);
router.get('/history', StockController.getHistory);

module.exports = router;