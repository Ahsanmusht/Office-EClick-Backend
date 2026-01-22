const { executeQuery, executeTransaction } = require('../config/database');

class Stock {
  
  async getStock(productId, warehouseId) {
    const sql = `
      SELECT 
        s.*,
        p.name as product_name,
        p.sku,
        p.unit_type,
        w.name as warehouse_name
      FROM stock s
      INNER JOIN products p ON s.product_id = p.id
      INNER JOIN warehouses w ON s.warehouse_id = w.id
      WHERE s.product_id = ? AND s.warehouse_id = ?
    `;
    
    const [stock] = await executeQuery(sql, [productId, warehouseId]);
    return stock;
  }

  async updateStock(productId, warehouseId, quantityChange, movementType, metadata = {}) {
    const queries = [];
    
    // 1. Update or insert stock
    queries.push({
      sql: `
        INSERT INTO stock (product_id, warehouse_id, quantity, available_quantity, last_updated)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          quantity = quantity + ?,
          available_quantity = available_quantity + ?,
          last_updated = NOW()
      `,
      params: [productId, warehouseId, quantityChange, quantityChange, quantityChange, quantityChange]
    });

    // 2. Record movement
    queries.push({
      sql: `
        INSERT INTO stock_movements 
        (product_id, warehouse_id, movement_type, quantity, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
      params: [
        productId,
        warehouseId,
        movementType,
        quantityChange,
        metadata.notes || '',
        metadata.created_by || 1
      ]
    });

    await executeTransaction(queries);
    return await this.getStock(productId, warehouseId);
  }

  async transferStock(productId, fromWarehouseId, toWarehouseId, quantity, notes = '', userId = 1) {
    // Check source warehouse has enough stock
    const sourceStock = await this.getStock(productId, fromWarehouseId);
    
    if (!sourceStock || sourceStock.available_quantity < quantity) {
      throw new Error('Insufficient stock in source warehouse');
    }

    const queries = [];

    // 1. Reduce from source
    queries.push({
      sql: `
        UPDATE stock 
        SET quantity = quantity - ?,
            available_quantity = available_quantity - ?,
            updated_at = NOW()
        WHERE product_id = ? AND warehouse_id = ?
      `,
      params: [quantity, quantity, productId, fromWarehouseId]
    });

    // 2. Add to destination
    queries.push({
      sql: `
        INSERT INTO stock (product_id, warehouse_id, quantity, available_quantity, updated_at)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          quantity = quantity + ?,
          available_quantity = available_quantity + ?,
          updated_at = NOW()
      `,
      params: [productId, toWarehouseId, quantity, quantity, quantity, quantity]
    });

    // 3. Record source movement
    queries.push({
      sql: `
        INSERT INTO stock_movements 
        (product_id, warehouse_id, movement_type, quantity, reference_id, notes, created_by, created_at)
        VALUES (?, ?, 'transfer_out', ?, ?, ?, ?, NOW())
      `,
      params: [productId, fromWarehouseId, -quantity, toWarehouseId, `Transfer to warehouse ${toWarehouseId}: ${notes}`, userId]
    });

    // 4. Record destination movement
    queries.push({
      sql: `
        INSERT INTO stock_movements 
        (product_id, warehouse_id, movement_type, quantity, reference_id, notes, created_by, created_at)
        VALUES (?, ?, 'transfer_in', ?, ?, ?, ?, NOW())
      `,
      params: [productId, toWarehouseId, quantity, fromWarehouseId, `Transfer from warehouse ${fromWarehouseId}: ${notes}`, userId]
    });

    await executeTransaction(queries);
  }

  async getStockHistory(productId = null, warehouseId = null, limit = 50) {
    let sql = `
      SELECT 
        sm.*,
        p.name as product_name,
        p.sku,
        w.name as warehouse_name,
        u.username as created_by_name
      FROM stock_movements sm
      INNER JOIN products p ON sm.product_id = p.id
      INNER JOIN warehouses w ON sm.warehouse_id = w.id
      LEFT JOIN users u ON sm.created_by = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    if (productId) {
      sql += ' AND sm.product_id = ?';
      params.push(productId);
    }
    
    if (warehouseId) {
      sql += ' AND sm.warehouse_id = ?';
      params.push(warehouseId);
    }
    
    sql += ' ORDER BY sm.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    return await executeQuery(sql, params);
  }
}

module.exports = new Stock();