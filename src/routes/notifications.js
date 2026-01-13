const express = require('express');
const router = express.Router();
const { NotificationController } = require('../controllers/NotificationController');
const auth = require('../middleware/auth');

// Notifications
router.get('/', auth, NotificationController.getUserNotifications);
router.post('/', auth, NotificationController.createNotification);
router.put('/:id/read', auth, NotificationController.markAsRead);
router.put('/mark-all-read', auth, NotificationController.markAllAsRead);

// Stock Alerts
router.post('/stock-alerts/check', auth, NotificationController.checkAndCreateStockAlerts);
router.get('/stock-alerts', auth, NotificationController.getStockAlerts);
router.put('/stock-alerts/:id/resolve', auth, NotificationController.resolveStockAlert);

module.exports = router;