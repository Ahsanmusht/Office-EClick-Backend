const BaseModel = require('./BaseModel');
const { executeQuery, executeTransaction } = require('../config/database');

class Stock extends BaseModel {
  constructor() {
    super('stock');
  }

  async getStock(productId, warehouseId) {
    const sql = `SELECT * FROM stock WHERE product_id = ? AND warehouse_id = ?`;
    const results = await executeQuery(sql, [productId, warehouseId]);
    return results[0] || null;
  }

  async updateStock(productId, warehouseId, quantity, movementType, referenceData = {}) {
    const queries = [];
    
    // Update or insert stock
    queries.push({
      sql: `INSERT INTO stock (product_id, warehouse_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
      params: [productId, warehouseId, quantity, quantity]
    });
    
    // Record movement
    queries.push({
      sql: `INSERT INTO stock_movements 
            (product_id, warehouse_id, movement_type, quantity, reference_type, 
             reference_id, notes, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        productId,
        warehouseId,
        movementType,
        quantity,
        referenceData.reference_type || null,
        referenceData.reference_id || null,
        referenceData.notes || null,
        referenceData.created_by || null
      ]
    });
    
    await executeTransaction(queries);
    return await this.getStock(productId, warehouseId);
  }

  async transferStock(productId, fromWarehouseId, toWarehouseId, quantity, notes = '') {
    const queries = [];
    
    // Deduct from source
    queries.push({
      sql: `UPDATE stock SET quantity = quantity - ? 
            WHERE product_id = ? AND warehouse_id = ? AND available_quantity >= ?`,
      params: [quantity, productId, fromWarehouseId, quantity]
    });
    
    // Add to destination
    queries.push({
      sql: `INSERT INTO stock (product_id, warehouse_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
      params: [productId, toWarehouseId, quantity, quantity]
    });
    
    // Record movement
    queries.push({
      sql: `INSERT INTO stock_movements 
            (product_id, warehouse_id, movement_type, quantity, from_warehouse_id, 
             to_warehouse_id, notes)
            VALUES (?, ?, 'transfer', ?, ?, ?, ?)`,
      params: [productId, fromWarehouseId, quantity, fromWarehouseId, toWarehouseId, notes]
    });
    
    await executeTransaction(queries);
    return true;
  }

  async getStockHistory(productId, warehouseId, limit = 50) {
    const sql = `SELECT sm.*, u.full_name as created_by_name
                 FROM stock_movements sm
                 LEFT JOIN users u ON sm.created_by = u.id
                 WHERE sm.product_id = ? AND sm.warehouse_id = ?
                 ORDER BY sm.created_at DESC
                 LIMIT ?`;
    
    return await executeQuery(sql, [productId, warehouseId, limit]);
  }
}

module.exports = new Stock();