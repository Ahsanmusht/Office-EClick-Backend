const express = require('express');
const router = express.Router();
const DynamicSchemaController = require('../controllers/DynamicSchemaController');
const auth = require('../middleware/auth');

// Entity management
router.post('/entities', auth, DynamicSchemaController.createEntity);
router.post('/attributes', auth, DynamicSchemaController.addAttribute);
router.get('/entities/:entityName/schema', DynamicSchemaController.getSchema);

// Record management
router.post('/entities/:entityName/records', auth, DynamicSchemaController.createRecord);
router.get('/entities/:entityName/records', DynamicSchemaController.listRecords);
router.get('/entities/:entityName/records/:recordId', DynamicSchemaController.getRecord);
router.put('/entities/:entityName/records/:recordId', auth, DynamicSchemaController.updateRecord);
router.delete('/entities/:entityName/records/:recordId', auth, DynamicSchemaController.deleteRecord);

module.exports = router;