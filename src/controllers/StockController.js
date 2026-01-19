const Stock = require('../models/Stock');
const { executeQuery } = require('../config/database');

class StockController {
  
  async getAllStock(req, res, next) {
    try {
      const { product_id, warehouse_id, low_stock } = req.query;
      
      let sql = `
        SELECT 
          s.*,
          p.name as product_name,
          p.sku,
          p.unit_type,
          p.base_price,
          p.min_stock_level,
          p.reorder_level,
          p.max_stock_level,
          w.name as warehouse_name,
          w.location as warehouse_location,
          pc.name as category_name
        FROM stock s
        INNER JOIN products p ON s.product_id = p.id
        INNER JOIN warehouses w ON s.warehouse_id = w.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE p.is_active = 1
      `;
      
      const params = [];
      
      // Filter by warehouse (0 = all, specific ID = that warehouse)
      if (warehouse_id && warehouse_id !== '0') {
        sql += ' AND s.warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      // Filter by product (0 = all, specific ID = that product)
      if (product_id && product_id !== '0') {
        sql += ' AND s.product_id = ?';
        params.push(product_id);
      }
      
      // Low stock filter
      if (low_stock === 'true') {
        sql += ' AND s.quantity <= p.reorder_level';
      }
      
      sql += ' ORDER BY p.name ASC, w.name ASC';
      
      const stock = await executeQuery(sql, params);
      
      res.json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  }

  async getStock(req, res, next) {
    try {
      const { product_id, warehouse_id } = req.params;
      
      if (!product_id || !warehouse_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'product_id and warehouse_id are required' 
        });
      }
      
      const stock = await Stock.getStock(product_id, warehouse_id);
      res.json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  }

  async adjustStock(req, res, next) {
    try {
      const { product_id, warehouse_id, adjustment_type, quantity, reason, notes } = req.body;
      
      if (!product_id || !warehouse_id || !quantity || !adjustment_type) {
        return res.status(400).json({
          success: false,
          error: 'product_id, warehouse_id, quantity, and adjustment_type are required'
        });
      }

      const adjustmentQty = adjustment_type === 'add' ? quantity : -quantity;
      
      const stock = await Stock.updateStock(
        product_id,
        warehouse_id,
        adjustmentQty,
        'adjustment',
        { 
          notes: `${reason}: ${notes || ''}`, 
          created_by: req.user?.id || 1,
          reason 
        }
      );
      
      res.json({ 
        success: true, 
        data: stock,
        message: 'Stock adjusted successfully' 
      });
    } catch (error) {
      next(error);
    }
  }

  async transferStock(req, res, next) {
    try {
      const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = req.body;
      
      if (!product_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
        return res.status(400).json({
          success: false,
          error: 'product_id, from_warehouse_id, to_warehouse_id, and quantity are required'
        });
      }

      if (from_warehouse_id === to_warehouse_id) {
        return res.status(400).json({
          success: false,
          error: 'Source and destination warehouses must be different'
        });
      }
      
      await Stock.transferStock(
        product_id,
        from_warehouse_id,
        to_warehouse_id,
        quantity,
        notes,
        req.user?.id || 1
      );
      
      res.json({ 
        success: true, 
        message: 'Stock transferred successfully' 
      });
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req, res, next) {
    try {
      const { product_id, warehouse_id, limit = 50 } = req.query;
      
      const history = await Stock.getStockHistory(product_id, warehouse_id, limit);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }

  async getAlerts(req, res, next) {
    try {
      const sql = `
        SELECT 
          s.id,
          s.product_id,
          s.warehouse_id,
          s.quantity,
          s.available_quantity,
          p.name as product_name,
          p.sku,
          p.min_stock_level,
          p.reorder_level,
          w.name as warehouse_name,
          pc.name as category_name,
          CASE 
            WHEN s.quantity = 0 THEN 'out_of_stock'
            WHEN s.quantity <= p.min_stock_level THEN 'critical'
            WHEN s.quantity <= p.reorder_level THEN 'low'
          END as alert_type,
          s.last_updated as alert_date
        FROM stock s
        INNER JOIN products p ON s.product_id = p.id
        INNER JOIN warehouses w ON s.warehouse_id = w.id
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        WHERE p.is_active = 1 
          AND (s.quantity = 0 OR s.quantity <= p.reorder_level)
        ORDER BY 
          CASE 
            WHEN s.quantity = 0 THEN 1
            WHEN s.quantity <= p.min_stock_level THEN 2
            ELSE 3
          END,
          s.quantity ASC
      `;
      
      const alerts = await executeQuery(sql);
      
      res.json({ success: true, data: alerts });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StockController();