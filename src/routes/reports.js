const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/ReportController');

// Dashboard
router.get('/dashboard', ReportController.getDashboardStats);

// Sales Reports
router.get('/sales', ReportController.getSalesReport);
router.get('/sales/top-products', ReportController.getTopSellingProducts);
router.get('/sales/customers', ReportController.getCustomerReport);

// Inventory Reports
router.get('/inventory/valuation', ReportController.getStockValuation);
router.get('/inventory/movements', ReportController.getStockMovementReport);

// Financial Reports
router.get('/profit-loss', ReportController.getProfitLossReport);

module.exports = router;