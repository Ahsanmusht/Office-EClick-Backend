const express = require('express');
const router = express.Router();
const EmployeeController = require('../controllers/EmployeeController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

router.get('/', auth, checkPermission('employees.view'), EmployeeController.getAll);
router.get('/:id', auth, checkPermission('employees.view'), EmployeeController.getById);
router.get('/:id/salary', auth, checkPermission('employees.view'), EmployeeController.getSalaryDetails);
router.post('/', auth, checkPermission('employees.create'), EmployeeController.create);
router.put('/:id', auth, checkPermission('employees.edit'), EmployeeController.update);
router.delete('/:id', auth, checkPermission('employees.delete'), EmployeeController.delete);

module.exports = router;