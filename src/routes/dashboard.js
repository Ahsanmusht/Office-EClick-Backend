const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
const auth = require('../middleware/auth');

router.get('/stats', auth, DashboardController.getDashboardStats);

module.exports = router;