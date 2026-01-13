const express = require('express');
const router = express.Router();
const FinanceController = require('../controllers/FinanceController');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');

// Bank Accounts
router.get('/bank-accounts', auth, checkPermission('finance.banks.manage'), FinanceController.getBankAccounts);
router.post('/bank-accounts', auth, FinanceController.createBankAccount);
router.put('/bank-accounts/:id', auth, FinanceController.updateBankAccount);

// Bank Transactions
router.get('/bank-transactions', auth, checkPermission('finance.transactions.create'), FinanceController.getBankTransactions);
router.post('/bank-transactions', auth, FinanceController.recordBankTransaction);
router.post('/bank-accounts/:bank_account_id/reconcile', auth, FinanceController.reconcileBankAccount);

// Cash Flow
router.get('/cash-flow', auth, FinanceController.getCashFlow);
router.get('/cash-flow/forecast', auth, FinanceController.getCashFlowForecast);

// Budgets
router.get('/budgets', auth, FinanceController.getBudgets);
router.post('/budgets', auth, FinanceController.createBudget);
router.put('/budgets/:id/spending', auth, FinanceController.updateBudgetSpending);
router.get('/budgets/analysis', auth, FinanceController.getBudgetAnalysis);

// Reports
router.get('/summary', auth, checkPermission('finance.reports.view'), FinanceController.getFinancialSummary);
router.get('/balance-sheet', auth, checkPermission('finance.reports.view'), FinanceController.getBalanceSheet);

module.exports = router;