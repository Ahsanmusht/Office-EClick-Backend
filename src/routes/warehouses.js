const express = require("express");
const router = express.Router();
const WarehouseController = require("../controllers/WarehouseController");
const auth = require("../middleware/auth");

router.get("/", WarehouseController.getAll);
router.get("/:id", WarehouseController.getById);
router.post("/", auth, WarehouseController.create);
router.put("/:id", auth, WarehouseController.update);
router.delete("/:id", auth, WarehouseController.delete);

module.exports = router;
