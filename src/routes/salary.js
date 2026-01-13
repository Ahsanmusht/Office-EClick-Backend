const express = require('express');
const router = express.Router();
const SalaryController = require('../controllers/SalaryController');
const auth = require('../middleware/auth');

// Salary Management
router.get('/salaries', auth, SalaryController.getSalaries);
router.post('/salaries/generate', auth, SalaryController.generateMonthlySalaries);
router.put('/salaries/:id', auth, SalaryController.updateSalary);
router.post('/salaries/:id/pay', auth, SalaryController.paySalary);
router.get('/salaries/report', auth, SalaryController.getSalaryReport);

// Recurring Expenses
router.get('/recurring-schedules', auth, SalaryController.getRecurringSchedules);
router.post('/recurring-schedules', auth, SalaryController.createRecurringSchedule);
router.put('/recurring-schedules/:id', auth, SalaryController.updateRecurringSchedule);
router.post('/recurring-schedules/process', auth, SalaryController.processRecurringExpenses);
router.get('/recurring-schedules/upcoming', auth, SalaryController.getUpcomingRecurringExpenses);

module.exports = router;