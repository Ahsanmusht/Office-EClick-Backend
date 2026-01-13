const express = require('express');
const router = express.Router();
const ExpenseController = require('../controllers/ExpenseController');
const auth = require('../middleware/auth');

// Expenses
router.get('/', ExpenseController.getAll);
router.get('/report', ExpenseController.getExpenseReport);
router.get('/monthly', ExpenseController.getMonthlyExpenses);
router.get('/:id', ExpenseController.getById);
router.post('/', auth, ExpenseController.create);
router.put('/:id', auth, ExpenseController.update);
router.delete('/:id', auth, ExpenseController.delete);

// Categories
router.get('/categories/all', ExpenseController.getCategories);
router.post('/categories', auth, ExpenseController.createCategory);

module.exports = router;