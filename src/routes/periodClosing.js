const express = require('express');
const router = express.Router();
const { PeriodClosingController } = require('../controllers/NotificationController');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/permissions');

router.get('/', auth, PeriodClosingController.getPeriodClosings);
router.get('/:id', auth, PeriodClosingController.getPeriodClosingById);
router.post('/close', auth, requireRole(['admin']), PeriodClosingController.closePeriod);
router.post('/:id/lock', auth, PeriodClosingController.lockPeriod);
router.post('/:id/reopen', auth, PeriodClosingController.reopenPeriod);
router.get('/analysis/comparative', auth, PeriodClosingController.getComparativePeriodAnalysis);

module.exports = router;