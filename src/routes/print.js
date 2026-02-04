const express = require('express');
const router = express.Router();
const PrintController = require('../controllers/PrintController');
const auth = require('../middleware/auth');

router.get('/sales-order/:id', auth, PrintController.getSalesOrderSlip);
router.get('/purchase-order/:id', auth, PrintController.getPurchaseOrderSlip);

module.exports = router;