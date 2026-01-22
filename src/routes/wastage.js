const express = require('express');
const router = express.Router();
const WastageController = require('../controllers/WastageController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('stock.view'), WastageController.getAll);
router.get('/report', auth, checkPermission('stock.view'), WastageController.getReport);
router.post('/', auth, checkPermission('stock.view'), WastageController.create);
router.post('/:id/approve', auth, checkPermission('wastage.approve'), WastageController.approve);

module.exports = router;