const express = require('express');
const router = express.Router();
const SalesController = require('../controllers/SalesController');
const auth = require('../middleware/auth');

router.get('/', SalesController.getOrders);
router.get('/:id', SalesController.getOrderById);
router.post('/', auth, SalesController.createOrder);
router.post('/:id/confirm', auth, SalesController.confirmOrder);

module.exports = router;