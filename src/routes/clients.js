const express = require('express');
const router = express.Router();
const ClientController = require('../controllers/ClientController');
const auth = require('../middleware/auth');

router.get('/', ClientController.getAll);
router.get('/suppliers', ClientController.getSuppliers);
router.get('/customers', ClientController.getCustomers);
router.get('/:id', ClientController.getById);
router.get('/:id/transactions', ClientController.getClientTransactions);
router.post('/', auth, ClientController.create);
router.put('/:id', auth, ClientController.update);
router.delete('/:id', auth, ClientController.delete);

module.exports = router;