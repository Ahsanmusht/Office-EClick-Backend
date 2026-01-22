// src/controllers/MenuController.js
const { executeQuery } = require("../config/database");

class MenuController {
  /**
   * Get user's dynamic menu based on their permissions
   * GET /api/menu
   * Headers: Authorization: Bearer <token>
   */
  getUserMenu = async (req, res, next) => {
    try {
      const userRole = req.user.role;

      // Admin gets all menus
      if (userRole === "admin") {
        const menu = await this.buildCompleteMenu();
        return res.json({
          success: true,
          data: menu,
        });
      }

      // For other roles, build permission-based menu
      const menu = await this.buildPermissionBasedMenu(userRole);

      res.json({
        success: true,
        data: menu,
      });
    } catch (error) {
      console.error("Menu fetch error:", error);
      next(error);
    }
  };

  /**
   * Build complete menu (for admin)
   */
  buildCompleteMenu = async () => {
    const sql = `
      SELECT 
        mi.id,
        mi.code,
        mi.title,
        mi.type,
        mi.parent_code,
        mi.url,
        mi.icon,
        mi.sort_order,
        mi.is_static,
        mi.breadcrumbs
      FROM menu_items mi
      WHERE mi.is_active = 1
      ORDER BY mi.sort_order ASC
    `;

    const menuItems = await executeQuery(sql);
    return this.buildMenuHierarchy(menuItems);
  };

  /**
   * Build permission-based menu for specific role
   */
  buildPermissionBasedMenu = async (role) => {
    const sql = `
      SELECT DISTINCT
        mi.id,
        mi.code,
        mi.title,
        mi.type,
        mi.parent_code,
        mi.url,
        mi.icon,
        mi.sort_order,
        mi.is_static,
        mi.breadcrumbs
      FROM menu_items mi
      LEFT JOIN menu_permissions mp ON mi.code = mp.menu_code
      LEFT JOIN permissions p ON mp.permission_code = p.code
      LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role = ?
      WHERE mi.is_active = 1
        AND (
          mi.is_static = 1 
          OR rp.id IS NOT NULL
        )
      ORDER BY mi.sort_order ASC
    `;

    const menuItems = await executeQuery(sql, [role]);
    return this.buildMenuHierarchy(menuItems);
  };

  /**
   * Build hierarchical menu structure
   * Converts flat array to nested tree structure
   */
  buildMenuHierarchy = (flatMenu) => {
    const menuMap = new Map();
    const rootItems = [];

    // First pass: Create all menu items
    flatMenu.forEach((item) => {
      menuMap.set(item.code, {
        id: item.code,
        title: item.title,
        type: item.type,
        url: item.url || undefined,
        icon: item.icon || undefined,
        breadcrumbs: item.breadcrumbs === 1,
        children: [],
        _parent: item.parent_code,
        _sort: item.sort_order,
      });
    });

    // Second pass: Build hierarchy
    menuMap.forEach((item, code) => {
      if (!item._parent) {
        // Root level item
        rootItems.push(item);
      } else {
        // Child item - add to parent's children
        const parent = menuMap.get(item._parent);
        if (parent) {
          parent.children.push(item);
        }
      }
    });

    // Clean up and remove empty children arrays
    const cleanMenu = (items) => {
      items.forEach((item) => {
        delete item._parent;
        delete item._sort;

        if (item.children.length === 0) {
          delete item.children;
        } else {
          // Sort children and recursively clean
          item.children.sort((a, b) => a._sort - b._sort);
          cleanMenu(item.children);
        }
      });
      return items;
    };

    // Sort root items
    rootItems.sort((a, b) => a._sort - b._sort);
    
    return cleanMenu(rootItems);
  };

  /**
   * Get user's accessible menu codes (for frontend route protection)
   * GET /api/menu/accessible-routes
   */
  getAccessibleRoutes = async (req, res, next) => {
    try {
      const userRole = req.user.role;

      if (userRole === "admin") {
        // Admin gets all routes
        const sql = `
          SELECT DISTINCT url 
          FROM menu_items 
          WHERE is_active = 1 AND url IS NOT NULL
        `;
        const routes = await executeQuery(sql);
        return res.json({
          success: true,
          data: routes.map((r) => r.url),
        });
      }

      // Get routes based on permissions
      const sql = `
        SELECT DISTINCT mi.url
        FROM menu_items mi
        LEFT JOIN menu_permissions mp ON mi.code = mp.menu_code
        LEFT JOIN permissions p ON mp.permission_code = p.code
        LEFT JOIN role_permissions rp ON p.id = rp.permission_id AND rp.role = ?
        WHERE mi.is_active = 1 
          AND mi.url IS NOT NULL
          AND (mi.is_static = 1 OR rp.id IS NOT NULL)
      `;

      const routes = await executeQuery(sql, [userRole]);

      res.json({
        success: true,
        data: routes.map((r) => r.url),
      });
    } catch (error) {
      console.error("Routes fetch error:", error);
      next(error);
    }
  };

  /**
   * Admin: Get all menu items (for management)
   * GET /api/menu/all
   */
  getAllMenuItems = async (req, res, next) => {
    try {
      const sql = `
        SELECT 
          mi.*,
          GROUP_CONCAT(mp.permission_code) as required_permissions
        FROM menu_items mi
        LEFT JOIN menu_permissions mp ON mi.code = mp.menu_code
        GROUP BY mi.id
        ORDER BY mi.sort_order
      `;

      const items = await executeQuery(sql);

      res.json({
        success: true,
        data: items,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Create new menu item
   * POST /api/menu
   */
  createMenuItem = async (req, res, next) => {
    try {
      const {
        code,
        title,
        type,
        parent_code,
        url,
        icon,
        sort_order,
        is_static,
        permissions,
      } = req.body;

      // Insert menu item
      const insertSql = `
        INSERT INTO menu_items 
        (code, title, type, parent_code, url, icon, sort_order, is_static)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await executeQuery(insertSql, [
        code,
        title,
        type,
        parent_code || null,
        url || null,
        icon || null,
        sort_order || 0,
        is_static || 0,
      ]);

      // Insert permissions mapping if provided
      if (permissions && permissions.length > 0) {
        const permissionSql = `
          INSERT INTO menu_permissions (menu_code, permission_code)
          VALUES (?, ?)
        `;

        for (const permCode of permissions) {
          await executeQuery(permissionSql, [code, permCode]);
        }
      }

      res.status(201).json({
        success: true,
        message: "Menu item created successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Update menu item
   * PUT /api/menu/:code
   */
  updateMenuItem = async (req, res, next) => {
    try {
      const { code } = req.params;
      const {
        title,
        type,
        parent_code,
        url,
        icon,
        sort_order,
        is_static,
        is_active,
        permissions,
      } = req.body;

      // Update menu item
      const updateSql = `
        UPDATE menu_items
        SET 
          title = COALESCE(?, title),
          type = COALESCE(?, type),
          parent_code = ?,
          url = ?,
          icon = ?,
          sort_order = COALESCE(?, sort_order),
          is_static = COALESCE(?, is_static),
          is_active = COALESCE(?, is_active)
        WHERE code = ?
      `;

      await executeQuery(updateSql, [
        title,
        type,
        parent_code,
        url,
        icon,
        sort_order,
        is_static,
        is_active,
        code,
      ]);

      // Update permissions if provided
      if (permissions) {
        // Delete existing
        await executeQuery("DELETE FROM menu_permissions WHERE menu_code = ?", [
          code,
        ]);

        // Insert new
        if (permissions.length > 0) {
          const permissionSql = `
            INSERT INTO menu_permissions (menu_code, permission_code)
            VALUES (?, ?)
          `;
          for (const permCode of permissions) {
            await executeQuery(permissionSql, [code, permCode]);
          }
        }
      }

      res.json({
        success: true,
        message: "Menu item updated successfully",
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Admin: Delete menu item
   * DELETE /api/menu/:code
   */
  deleteMenuItem = async (req, res, next) => {
    try {
      const { code } = req.params;

      await executeQuery("DELETE FROM menu_items WHERE code = ?", [code]);

      res.json({
        success: true,
        message: "Menu item deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = new MenuController();