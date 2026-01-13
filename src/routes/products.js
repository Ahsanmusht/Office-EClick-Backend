const express = require('express');
const router = express.Router();
const ProductController = require('../controllers/ProductController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', ProductController.getAll);
router.get('/low-stock', auth, checkPermission('stock.view'), ProductController.getLowStock);
router.get('/:id', auth, checkPermission('products.view'), ProductController.getById);
router.post('/', auth, checkPermission('products.create'), ProductController.create);
router.put('/:id', auth, checkPermission('products.edit'), ProductController.update);
router.delete('/:id', auth, checkPermission('products.delete'), ProductController.delete);

module.exports = router;