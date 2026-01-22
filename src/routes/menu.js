// src/routes/menu.js
const express = require("express");
const router = express.Router();
const MenuController = require("../controllers/MenuController");
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/permissions");

/**
 * @route   GET /api/menu
 * @desc    Get user's dynamic menu based on permissions
 * @access  Private (requires authentication)
 */
router.get("/", auth, MenuController.getUserMenu);

/**
 * @route   GET /api/menu/accessible-routes
 * @desc    Get list of accessible routes for route protection
 * @access  Private
 */
router.get("/accessible-routes", auth, MenuController.getAccessibleRoutes);

/**
 * @route   GET /api/menu/all
 * @desc    Get all menu items (admin only)
 * @access  Private (admin only)
 */
router.get("/all", auth, requireRole(["admin"]), MenuController.getAllMenuItems);

/**
 * @route   POST /api/menu
 * @desc    Create new menu item (admin only)
 * @access  Private (admin only)
 */
router.post("/", auth, requireRole(["admin"]), MenuController.createMenuItem);

/**
 * @route   PUT /api/menu/:code
 * @desc    Update menu item (admin only)
 * @access  Private (admin only)
 */
router.put("/:code", auth, requireRole(["admin"]), MenuController.updateMenuItem);

/**
 * @route   DELETE /api/menu/:code
 * @desc    Delete menu item (admin only)
 * @access  Private (admin only)
 */
router.delete(
  "/:code",
  auth,
  requireRole(["admin"]),
  MenuController.deleteMenuItem
);

module.exports = router;