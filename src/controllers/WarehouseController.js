const BaseModel = require("../models/BaseModel");
const { executeQuery } = require("../config/database");

const Warehouse = new BaseModel("warehouses");

class WarehouseController {
  async getAll(req, res, next) {
    try {
      const warehouses = await Warehouse.findAll({
        where: "is_active = 1",
        orderBy: "name ASC",
      });

      // Get stock summary for each warehouse
      for (let warehouse of warehouses) {
        const sql = `
          SELECT 
            COUNT(DISTINCT product_id) as product_count,
            COALESCE(SUM(quantity), 0) as total_quantity
          FROM stock
          WHERE warehouse_id = ?
        `;
        const [summary] = await executeQuery(sql, [warehouse.id]);
        warehouse.stock_summary = summary;
      }

      res.json({ success: true, data: warehouses });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const warehouse = await Warehouse.findById(id);

      if (!warehouse) {
        return res.status(404).json({
          success: false,
          error: "Warehouse not found",
        });
      }

      // Get stock details
      const stockSql = `
        SELECT s.*, p.name as product_name, p.sku
        FROM stock s
        LEFT JOIN products p ON s.product_id = p.id
        WHERE s.warehouse_id = ?
        ORDER BY p.name
      `;
      const stock = await executeQuery(stockSql, [id]);

      res.json({ success: true, data: { ...warehouse, stock } });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const warehouse = await Warehouse.create(req.body);
      res.status(201).json({ success: true, data: warehouse });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const warehouse = await Warehouse.update(id, req.body);

      if (!warehouse) {
        return res.status(404).json({
          success: false,
          error: "Warehouse not found",
        });
      }

      res.json({ success: true, data: warehouse });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      // Soft delete
      await Warehouse.update(id, { is_active: 0 });
      res.json({ success: true, message: "Warehouse deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WarehouseController();
