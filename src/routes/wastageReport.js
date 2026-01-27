// src/routes/wastageReport.js - COMPLETE WASTAGE TRACKING
const express = require('express');
const router = express.Router();
const WastageReportController = require('../controllers/WastageReportController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Wastage Reports
router.get('/summary', auth, checkPermission('reports.wastage.view'), WastageReportController.getWastageSummary);
router.get('/by-purchase', auth, checkPermission('reports.wastage.view'), WastageReportController.getWastageByPurchase);
router.get('/by-product', auth, checkPermission('reports.wastage.view'), WastageReportController.getWastageByProduct);
router.get('/detailed', auth, checkPermission('reports.wastage.view'), WastageReportController.getDetailedWastageReport);

module.exports = router;