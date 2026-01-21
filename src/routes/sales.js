const express = require("express");
const router = express.Router();
const SalesController = require("../controllers/SalesController");
const auth = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");

router.get("/", auth, checkPermission("sales.view"), SalesController.getOrders);
router.get(
  "/:id",
  auth,
  checkPermission("sales.view"),
  SalesController.getOrderById,
);
router.post(
  "/",
  auth,
  checkPermission("sales.create"),
  SalesController.createOrder,
);
router.put(
  "/:id",
  auth,
  checkPermission("sales.create"),
  SalesController.updateOrder,
); // ✅ NEW
router.post(
  "/:id/confirm",
  auth,
  checkPermission("sales.confirm"),
  SalesController.confirmOrder,
);
router.post(
  "/:id/cancel",
  auth,
  checkPermission("sales.cancel"),
  SalesController.cancelOrder,
);

module.exports = router;
