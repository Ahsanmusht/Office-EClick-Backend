const express = require('express');
const router = express.Router();
const SalaryController = require('../controllers/SalaryController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Salary Management
router.get('/salaries', auth, checkPermission('salary.view'), SalaryController.getSalaries);
router.get('/salaries/report', auth, checkPermission('salary.view'), SalaryController.getSalaryReport);
router.post('/salaries/generate', auth, checkPermission('salary.generate'), SalaryController.generateSalaryForEmployee);
router.put('/salaries/:id', auth, checkPermission('salary.generate'), SalaryController.updateSalary);
router.post('/salaries/:id/pay', auth, checkPermission('salary.pay'), SalaryController.paySalary);

// Recurring Expenses - Finance permission chahiye
router.get('/recurring-schedules', auth, checkPermission('expenses.view'), SalaryController.getRecurringSchedules);
router.post('/recurring-schedules', auth, checkPermission('expenses.create'), SalaryController.createRecurringSchedule);
router.put('/recurring-schedules/:id', auth, checkPermission('expenses.create'), SalaryController.updateRecurringSchedule);
router.post('/recurring-schedules/process', auth, checkPermission('expenses.approve'), SalaryController.processRecurringExpenses);
router.get('/recurring-schedules/upcoming', auth, checkPermission('expenses.view'), SalaryController.getUpcomingRecurringExpenses);

module.exports = router;