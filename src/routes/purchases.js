const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/PurchaseController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('purchases.view'), PurchaseController.getOrders);
router.get('/:id', auth, checkPermission('purchases.view'), PurchaseController.getOrderById);
router.post('/', auth, checkPermission('purchases.create'), PurchaseController.createOrder);
router.put('/:id', auth, checkPermission('purchases.create'), PurchaseController.updateOrder);
router.post('/:id/confirm', auth, checkPermission('purchases.approve'), PurchaseController.confirmOrder);
router.post('/:id/receive', auth, checkPermission('purchases.receive'), PurchaseController.receiveOrder);
router.post('/:id/cancel', auth, checkPermission('purchases.approve'), PurchaseController.cancelOrder);

module.exports = router;