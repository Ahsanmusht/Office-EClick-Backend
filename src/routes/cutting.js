const express = require('express');
const router = express.Router();
const CuttingController = require('../controllers/CuttingController');
const auth = require('../middleware/auth');

router.get('/', CuttingController.getOperations);
router.get('/report', CuttingController.getReport);
router.get('/:id', CuttingController.getOperationById);
router.post('/', auth, CuttingController.createOperation);
router.post('/:id/process', auth, CuttingController.processOperation);
router.post('/:id/cancel', auth, CuttingController.cancelOperation);

module.exports = router;