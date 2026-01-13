// src/middleware/permissions.js
const { executeQuery } = require("../config/database");

/**
 * Check if user has specific permission
 * Usage: router.post('/', auth, checkPermission('products.create'), ProductController.create);
 */
const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;

      // Admin bypass - admins have all permissions
      if (userRole === "admin") {
        return next();
      }

      // Check if role has the required permission
      const sql = `
        SELECT p.code 
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role = ? AND p.code = ?
      `;

      const result = await executeQuery(sql, [userRole, requiredPermission]);

      if (result.length === 0) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          required: requiredPermission,
          role: userRole,
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({
        success: false,
        error: "Permission check failed",
      });
    }
  };
};

/**
 * Check if user has ANY of the required permissions
 * Usage: checkAnyPermission(['products.create', 'products.edit'])
 */
const checkAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;

      if (userRole === "admin") {
        return next();
      }

      const placeholders = permissions.map(() => "?").join(",");
      const sql = `
        SELECT p.code 
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role = ? AND p.code IN (${placeholders})
      `;

      const result = await executeQuery(sql, [userRole, ...permissions]);

      if (result.length === 0) {
        return res.status(403).json({
          success: false,
          error: "Insufficient permissions",
          required_any: permissions,
          role: userRole,
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({
        success: false,
        error: "Permission check failed",
      });
    }
  };
};

/**
 * Simple role check without database query
 * Usage: requireRole(['admin', 'manager'])
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Access denied - insufficient role",
        required_roles: allowedRoles,
        your_role: req.user.role,
      });
    }
    next();
  };
};

/**
 * Get all permissions for a user's role
 */
const getUserPermissions = async (role) => {
  const sql = `
    SELECT p.code, p.name, p.module
    FROM role_permissions rp
    JOIN permissions p ON rp.permission_id = p.id
    WHERE rp.role = ?
    ORDER BY p.module, p.name
  `;

  return await executeQuery(sql, [role]);
};

module.exports = {
  checkPermission,
  checkAnyPermission,
  requireRole,
  getUserPermissions,
};
