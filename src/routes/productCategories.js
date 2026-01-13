const express = require("express");
const router = express.Router();
const ProductCategoryController = require("../controllers/ProductCategoryController");
const auth = require("../middleware/auth");

router.get("/", ProductCategoryController.getAll);
router.get("/:id", ProductCategoryController.getById);
router.post("/", auth, ProductCategoryController.create);
router.put("/:id", auth, ProductCategoryController.update);
router.delete("/:id", auth, ProductCategoryController.delete);

module.exports = router;
