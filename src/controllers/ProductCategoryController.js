const BaseModel = require("../models/BaseModel");
const { executeQuery } = require("../config/database");

const ProductCategory = new BaseModel("product_categories");

class ProductCategoryController {
  async getAll(req, res, next) {
    try {
      const { parent_id } = req.query;

      let where = "is_active = 1";
      let params = [];

      if (parent_id) {
        where += " AND parent_id = ?";
        params.push(parent_id);
      } else if (parent_id === null || parent_id === "null") {
        where += " AND parent_id IS NULL";
      }

      const categories = await ProductCategory.findAll({
        where,
        params,
        orderBy: "name ASC",
      });

      res.json({ success: true, data: categories });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT pc.*, parent.name as parent_name
        FROM product_categories pc
        LEFT JOIN product_categories parent ON pc.parent_id = parent.id
        WHERE pc.id = ?
      `;

      const [category] = await executeQuery(sql, [id]);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: "Category not found",
        });
      }

      // Get child categories
      const childSql = `SELECT * FROM product_categories WHERE parent_id = ? AND is_active = 1`;
      const children = await executeQuery(childSql, [id]);

      res.json({ success: true, data: { ...category, children } });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const category = await ProductCategory.create(req.body);
      res.status(201).json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const category = await ProductCategory.update(id, req.body);

      if (!category) {
        return res.status(404).json({
          success: false,
          error: "Category not found",
        });
      }

      res.json({ success: true, data: category });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      // Soft delete
      await ProductCategory.update(id, { is_active: 0 });
      res.json({ success: true, message: "Category deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductCategoryController();
