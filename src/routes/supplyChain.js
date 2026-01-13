const express = require('express');
const router = express.Router();
const SupplyChainController = require('../controllers/SupplyChainController');
const auth = require('../middleware/auth');

// Purchase Requisitions
router.get('/requisitions', auth, SupplyChainController.getRequisitions);
router.get('/requisitions/:id', auth, SupplyChainController.getRequisitionById);
router.post('/requisitions', auth, SupplyChainController.createRequisition);
router.post('/requisitions/:id/approve', auth, SupplyChainController.approveRequisition);
router.post('/requisitions/:id/reject', auth, SupplyChainController.rejectRequisition);
router.post('/requisitions/:id/convert-to-po', auth, SupplyChainController.convertToPurchaseOrder);

// Supplier Ratings
router.get('/supplier-ratings', auth, SupplyChainController.getSupplierRatings);
router.post('/supplier-ratings', auth, SupplyChainController.rateSupplier);
router.get('/suppliers/:supplier_id/performance', auth, SupplyChainController.getSupplierPerformance);
router.get('/suppliers/top', auth, SupplyChainController.getTopSuppliers);

// Analytics
router.get('/analytics/procurement', auth, SupplyChainController.getProcurementAnalytics);

module.exports = router;