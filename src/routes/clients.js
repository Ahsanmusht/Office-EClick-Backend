// src/routes/clients.js - UPDATED
const express = require('express');
const router = express.Router();
const UpdatedClientController = require('../controllers/ClientController');
const auth = require('../middleware/auth');

router.get('/', UpdatedClientController.getAll);
router.get('/outstanding-balances', UpdatedClientController.getOutstandingBalances);
router.get('/:id', UpdatedClientController.getById);
router.get('/:id/statement', UpdatedClientController.getClientStatement);
router.post('/', auth, UpdatedClientController.create);
router.put('/:id', auth, UpdatedClientController.update);
router.delete('/:id', auth, UpdatedClientController.delete);

module.exports = router;