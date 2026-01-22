const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const auth = require('../middleware/auth');

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.get('/profile', auth, AuthController.getProfile);
router.put('/profile', auth, AuthController.updateProfile);
router.post('/change-password', auth, AuthController.changePassword);
router.get('/users', auth, AuthController.getAllUsers);

router.get('/my-permissions', auth, AuthController.getMyPermissions);

module.exports = router;