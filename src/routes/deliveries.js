const express = require('express');
const router = express.Router();
const DeliveryController = require('../controllers/DeliveryController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('delivery.view'), DeliveryController.getDeliveries);
router.get('/today', auth, checkPermission('delivery.view'), DeliveryController.getTodayDeliveries);
router.get('/driver/:driver_name', auth, checkPermission('delivery.view'), DeliveryController.getDeliveriesByDriver);
router.get('/report', auth, checkPermission('delivery.view'), DeliveryController.getDeliveryReport);
router.get('/:id', auth, checkPermission('delivery.view'), DeliveryController.getDeliveryById);
router.post('/', auth, checkPermission('delivery.create'), DeliveryController.createDelivery);
router.put('/:id/status', auth, checkPermission('delivery.update_status'), DeliveryController.updateDeliveryStatus);

module.exports = router;