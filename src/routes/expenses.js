const express = require('express');
const router = express.Router();
const ExpenseController = require('../controllers/ExpenseController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Expenses
router.get('/', auth, checkPermission('expenses.view'), ExpenseController.getAll);
router.get('/report', auth, checkPermission('expenses.view'), ExpenseController.getExpenseReport);
router.get('/monthly', auth, checkPermission('expenses.view'), ExpenseController.getMonthlyExpenses);
router.get('/:id', auth, checkPermission('expenses.view'), ExpenseController.getById);
router.post('/', auth, checkPermission('expenses.create'), ExpenseController.create);
router.put('/:id', auth, checkPermission('expenses.create'), ExpenseController.update);
router.delete('/:id', auth, checkPermission('expenses.approve'), ExpenseController.delete);

// Categories - View kar sakte hain sab
router.get('/categories/all', auth, ExpenseController.getCategories);
router.post('/categories', auth, checkPermission('expenses.approve'), ExpenseController.createCategory);

module.exports = router;