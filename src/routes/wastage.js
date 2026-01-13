const express = require('express');
const router = express.Router();
const WastageController = require('../controllers/WastageController');
const auth = require('../middleware/auth');

router.get('/', WastageController.getAll);
router.get('/report', WastageController.getReport);
router.post('/', auth, WastageController.create);
router.post('/:id/approve', auth, WastageController.approve);

module.exports = router;