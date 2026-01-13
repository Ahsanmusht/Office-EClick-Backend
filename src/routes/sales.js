const express = require('express');
const router = express.Router();
const SalesController = require('../controllers/SalesController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('sales.view'), SalesController.getOrders);
router.get('/:id', auth, checkPermission('sales.view'), SalesController.getOrderById);
router.post('/', auth, checkPermission('sales.create'), SalesController.createOrder);
router.post('/:id/confirm', auth, checkPermission('sales.confirm'), SalesController.confirmOrder);

module.exports = router;