// src/routes/pettyCash.js - COMPLETE PETTY CASH CRUD
const express = require('express');
const router = express.Router();
const PettyCashController = require('../controllers/PettyCashController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Main CRUD Routes
router.get('/', auth, checkPermission('finance.transactions.view'), PettyCashController.getAll);
router.get('/summary', auth, checkPermission('finance.transactions.view'), PettyCashController.getSummary);
router.get('/daily-summary', auth, checkPermission('finance.transactions.view'), PettyCashController.getDailySummary);
router.get('/cash-book', auth, checkPermission('finance.transactions.view'), PettyCashController.getCashBook);
router.get('/:id', auth, checkPermission('finance.transactions.view'), PettyCashController.getById);
router.post('/', auth, checkPermission('finance.transactions.create'), PettyCashController.create);
router.put('/:id', auth, checkPermission('finance.transactions.create'), PettyCashController.update);
router.delete('/:id', auth, checkPermission('finance.transactions.create'), PettyCashController.delete);

// Client-specific
router.get('/client/:client_id/cash-flow', auth, checkPermission('finance.transactions.view'), PettyCashController.getClientCashFlow);

module.exports = router;