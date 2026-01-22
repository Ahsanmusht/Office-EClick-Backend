const express = require('express');
const router = express.Router();
const ReportController = require('../controllers/ReportController');
const auth = require('../middleware/auth');
const { checkPermission, checkAnyPermission } = require('../middleware/permissions');

// Dashboard 
router.get('/dashboard', auth, checkAnyPermission([
  'sales.view', 'purchases.view', 'stock.view', 'finance.reports.view'
]), ReportController.getDashboardStats);

// Sales Reports
router.get('/sales', auth, checkPermission('sales.view'), ReportController.getSalesReport);
router.get('/sales/top-products', auth, checkPermission('sales.view'), ReportController.getTopSellingProducts);
router.get('/sales/customers', auth, checkPermission('sales.view'), ReportController.getCustomerReport);

// Inventory Reports
router.get('/inventory/valuation', auth, checkPermission('stock.view'), ReportController.getStockValuation);
router.get('/inventory/movements', auth, checkPermission('stock.view'), ReportController.getStockMovementReport);

// Financial Reports
router.get('/profit-loss', auth, checkPermission('finance.reports.view'), ReportController.getProfitLossReport);

module.exports = router;