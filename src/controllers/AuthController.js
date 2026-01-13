const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const BaseModel = require('../models/BaseModel');
const config = require('../config/config');
const { executeQuery } = require('../config/database');

const User = new BaseModel('users');

class AuthController {
  
  async register(req, res, next) {
    try {
      const { username, email, password, full_name, role, warehouse_id } = req.body;
      
      // Check if user exists
      const existingUser = await executeQuery(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );
      
      if (existingUser.length > 0) {
        return res.status(400).json({ 
          success: false, 
          error: 'Username or email already exists' 
        });
      }
      
      // Hash password
      const password_hash = await bcrypt.hash(password, 10);
      
      // Create user
      const user = await User.create({
        username,
        email,
        password_hash,
        full_name,
        role: role || 'staff',
        warehouse_id,
        is_active: 1
      });
      
      // Generate token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      
      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            role: user.role
          },
          token
        }
      });
      
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { username, password } = req.body;
      
      // Find user
      const users = await executeQuery(
        'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
        [username, username]
      );
      
      if (users.length === 0) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid credentials' 
        });
      }
      
      const user = users[0];
      
      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid credentials' 
        });
      }
      
      // Update last login
      await executeQuery(
        'UPDATE users SET last_login = NOW() WHERE id = ?',
        [user.id]
      );
      
      // Generate token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
      
      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            warehouse_id: user.warehouse_id
          },
          token
        }
      });
      
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // Remove password
      delete user.password_hash;
      
      res.json({ success: true, data: user });
      
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const { full_name, phone, email } = req.body;
      
      const updates = {};
      if (full_name) updates.full_name = full_name;
      if (phone) updates.phone = phone;
      if (email) updates.email = email;
      
      const user = await User.update(req.user.id, updates);
      delete user.password_hash;
      
      res.json({ success: true, data: user });
      
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { old_password, new_password } = req.body;
      
      const user = await User.findById(req.user.id);
      
      // Verify old password
      const isValid = await bcrypt.compare(old_password, user.password_hash);
      
      if (!isValid) {
        return res.status(400).json({ 
          success: false, 
          error: 'Current password is incorrect' 
        });
      }
      
      // Hash new password
      const password_hash = await bcrypt.hash(new_password, 10);
      
      await User.update(req.user.id, { password_hash });
      
      res.json({ success: true, message: 'Password updated successfully' });
      
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(req, res, next) {
    try {
      const { limit = 20, offset = 0, role } = req.query;
      
      let where = 'is_active = 1';
      let params = [];
      
      if (role) {
        where += ' AND role = ?';
        params.push(role);
      }
      
      const users = await User.findAll({ limit, offset, where, params });
      const total = await User.count(where, params);
      
      // Remove passwords
      users.forEach(user => delete user.password_hash);
      
      res.json({ success: true, data: { users, total } });
      
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();