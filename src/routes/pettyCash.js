// src/routes/pettyCash.js
const express = require('express');
const router = express.Router();
const PettyCashController = require('../controllers/PettyCashController');
const auth = require('../middleware/auth');

// Main Routes
router.get('/', auth, PettyCashController.getAll);
router.get('/daily-summary', auth, PettyCashController.getDailySummary);
router.get('/cash-book', auth, PettyCashController.getCashBook);
router.get('/:id', auth, PettyCashController.getById);
router.post('/', auth, PettyCashController.create);

// Client-specific
router.get('/client/:client_id/cash-flow', auth, PettyCashController.getClientCashFlow);

module.exports = router;