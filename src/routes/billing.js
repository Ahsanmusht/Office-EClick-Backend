const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/BillingController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Invoices
router.get('/invoices', auth, checkPermission('billing.invoices.view'), BillingController.getInvoices);
router.get('/invoices/outstanding', auth, checkPermission('billing.invoices.view'), BillingController.getOutstandingInvoices);
router.get('/invoices/:id', auth, checkPermission('billing.invoices.view'), BillingController.getInvoiceById);
router.post('/invoices', auth, checkPermission('billing.invoices.create'), BillingController.createInvoice);
router.post('/invoices/from-order', auth, checkPermission('billing.invoices.create'), BillingController.createInvoiceFromOrder);
router.put('/invoices/:id', auth, checkPermission('billing.invoices.create'), BillingController.updateInvoice);

// Payments
router.get('/payments', auth, checkPermission('billing.invoices.view'), BillingController.getPayments);
router.get('/payments/:id', auth, checkPermission('billing.invoices.view'), BillingController.getPaymentById);
router.post('/payments', auth, checkPermission('billing.payments.create'), BillingController.createPayment);

module.exports = router;