const express = require('express');
const router = express.Router();
const PurchaseController = require('../controllers/PurchaseController');
const auth = require('../middleware/auth');

router.get('/', PurchaseController.getOrders);
router.get('/:id', PurchaseController.getOrderById);
router.post('/', auth, PurchaseController.createOrder);
router.put('/:id', auth, PurchaseController.updateOrder);
router.post('/:id/confirm', auth, PurchaseController.confirmOrder);
router.post('/:id/receive', auth, PurchaseController.receiveOrder);
router.post('/:id/cancel', auth, PurchaseController.cancelOrder);

module.exports = router;