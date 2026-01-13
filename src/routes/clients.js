const express = require('express');
const router = express.Router();
const ClientController = require('../controllers/ClientController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('clients.view'), ClientController.getAll);
router.get('/suppliers', auth, checkPermission('clients.view'), ClientController.getSuppliers);
router.get('/customers', auth, checkPermission('clients.view'), ClientController.getCustomers);
router.get('/:id', auth, checkPermission('clients.view'), ClientController.getById);
router.get('/:id/transactions', auth, checkPermission('clients.view'), ClientController.getClientTransactions);

router.post('/', auth, checkPermission('clients.create'), ClientController.create);
router.put('/:id', auth, checkPermission('clients.edit'), ClientController.update);
router.delete('/:id', auth, checkPermission('clients.delete'), ClientController.delete);

module.exports = router;