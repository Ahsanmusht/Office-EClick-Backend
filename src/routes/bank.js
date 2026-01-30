const express = require('express');
const router = express.Router();
const BankAccountController = require('../controllers/BankAccountController');
const auth = require('../middleware/auth');

router.get('/bank-accounts', auth, BankAccountController.getAll);
router.get('/bank-accounts/:id', auth, BankAccountController.getById);
router.post('/bank-accounts', auth, BankAccountController.create);
router.put('/bank-accounts/:id', auth, BankAccountController.update);
router.delete('/bank-accounts/:id', auth, BankAccountController.delete);
router.get('/bank-accounts/:id/statement', auth, BankAccountController.getStatement);

module.exports = router;