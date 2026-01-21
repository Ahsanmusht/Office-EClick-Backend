const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const {
  checkPermission,
  requireRole,
  getUserPermissions,
} = require("../middleware/permissions");
const { executeQuery } = require("../config/database");

// Get user's own permissions
router.get("/my-permissions", auth, async (req, res, next) => {
  try {
    const permissions = await getUserPermissions(req.user.role);
    res.json({ success: true, data: permissions });
  } catch (error) {
    next(error);
  }
});

// List all users - requires permission
router.get(
  "/",
  auth,
  checkPermission("users.manage"),
  async (req, res, next) => {
    try {
      const users = await executeQuery(
        "SELECT id, username, email, phone, full_name, role, is_active, last_login FROM users",
      );
      res.json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  },
);

// Create user - admin or manager with permission
router.post(
  "/",
  auth,
  checkPermission("users.manage"),
  async (req, res, next) => {
    try {
      const { username, email, password, full_name, role, phone, is_active } = req.body;

      // Only admin can create other admins
      if (role === "admin" && req.user.role !== "admin") {
        return res.status(403).json({
          success: false,
          error: "Only admins can create admin users",
        });
      }

      const bcrypt = require("bcryptjs");
      const password_hash = await bcrypt.hash(password, 10);

      const sql = `INSERT INTO users (username, email, password_hash, full_name, role, phone, is_active) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`;
      const result = await executeQuery(sql, [
        username,
        email,
        password_hash,
        full_name,
        role,
        phone,
        is_active,
      ]);

      res.status(201).json({
        success: true,
        data: { id: result.insertId, username, email, role },
      });
    } catch (error) {
      next(error);
    }
  },
);

// Update user role - admin only
router.put(
  "/:id/role",
  auth,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      const sql = `UPDATE users SET role = ? WHERE id = ?`;
      await executeQuery(sql, [role, id]);

      res.json({ success: true, message: "User role updated" });
    } catch (error) {
      next(error);
    }
  },
);

// Update user (basic info) - admin only
router.put("/:id", auth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email, full_name, phone, role, is_active } = req.body;

    const sql = `
        UPDATE users 
        SET username = ?, email = ?, full_name = ?, phone = ?, role = ?, is_active = ?
        WHERE id = ?
      `;

    const result = await executeQuery(sql, [
      username,
      email,
      full_name,
      phone,
      role,
      is_active,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User updated successfully",
      data: { id, username, email, full_name, is_active },
    });
  } catch (error) {
    next(error);
  }
});

// Reset user password - admin only
router.put(
  "/:id/reset-password",
  auth,
  requireRole(["admin"]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password || password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters",
        });
      }

      const bcrypt = require("bcryptjs");
      const password_hash = await bcrypt.hash(password, 10);

      const sql = `UPDATE users SET password_hash = ? WHERE id = ?`;
      const result = await executeQuery(sql, [password_hash, id]);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        message: "Password reset successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);


router.delete("/:id", auth, requireRole(["admin"]), async (req, res, next) => {
  try {
    const { id } = req.params;

    const sql = `DELETE FROM users WHERE id = ?`;
    const result = await executeQuery(sql, [id]);

    if (result.affectedRows > 0) {
      res.json({ success: true, message: "User deleted successfully" });
    } else {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
