const BaseModel = require('./BaseModel');
const { executeQuery } = require('../config/database');

class Product extends BaseModel {
  constructor() {
    super('products');
  }

  async findWithCategory(id) {
    const sql = `SELECT p.*, pc.name as category_name 
                 FROM products p
                 LEFT JOIN product_categories pc ON p.category_id = pc.id
                 WHERE p.id = ?`;
    const results = await executeQuery(sql, [id]);
    return results[0] || null;
  }

  async findAllWithStock(warehouseId = null) {
    let sql = `SELECT p.*, pc.name as category_name,
               COALESCE(SUM(s.quantity), 0) as total_stock,
               COALESCE(SUM(s.available_quantity), 0) as available_stock
               FROM products p
               LEFT JOIN product_categories pc ON p.category_id = pc.id
               LEFT JOIN stock s ON p.id = s.product_id`;
    
    if (warehouseId) {
      sql += ` AND s.warehouse_id = ?`;
    }
    
    sql += ` WHERE p.is_active = 1 GROUP BY p.id ORDER BY p.name`;
    
    return await executeQuery(sql, warehouseId ? [warehouseId] : []);
  }

  async getLowStockProducts(warehouseId = null) {
    let sql = `SELECT p.*, COALESCE(SUM(s.available_quantity), 0) as current_stock
               FROM products p
               LEFT JOIN stock s ON p.id = s.product_id`;
    
    if (warehouseId) {
      sql += ` AND s.warehouse_id = ?`;
    }
    
    sql += ` WHERE p.is_active = 1
             GROUP BY p.id
             HAVING current_stock <= p.reorder_level
             ORDER BY current_stock ASC`;
    
    return await executeQuery(sql, warehouseId ? [warehouseId] : []);
  }
}

module.exports = new Product();