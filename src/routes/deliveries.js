const express = require('express');
const router = express.Router();
const DeliveryController = require('../controllers/DeliveryController');
const auth = require('../middleware/auth');

router.get('/', DeliveryController.getDeliveries);
router.get('/today', DeliveryController.getTodayDeliveries);
router.get('/driver/:driver_name', DeliveryController.getDeliveriesByDriver);
router.get('/report', DeliveryController.getDeliveryReport);
router.get('/:id', DeliveryController.getDeliveryById);
router.post('/', auth, DeliveryController.createDelivery);
router.put('/:id/status', auth, DeliveryController.updateDeliveryStatus);

module.exports = router;