const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/BillingController');
const auth = require('../middleware/auth');

// Invoices
router.get('/invoices', BillingController.getInvoices);
router.get('/invoices/outstanding', BillingController.getOutstandingInvoices);
router.get('/invoices/:id', BillingController.getInvoiceById);
router.post('/invoices', auth, BillingController.createInvoice);
router.post('/invoices/from-order', auth, BillingController.createInvoiceFromOrder);
router.put('/invoices/:id', auth, BillingController.updateInvoice);

// Payments
router.get('/payments', BillingController.getPayments);
router.get('/payments/:id', BillingController.getPaymentById);
router.post('/payments', auth, BillingController.createPayment);

module.exports = router;