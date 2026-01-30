// src/controllers/WastageReportController.js - COMPLETE WASTAGE TRACKING
const { executeQuery } = require('../config/database');

class WastageReportController {

  // ==================== WASTAGE SUMMARY ====================
  async getWastageSummary(req, res, next) {
    try {
      const { start_date, end_date, warehouse_id } = req.query;

      let dateFilter = '1=1';
      let params = [];

      if (start_date && end_date) {
        dateFilter = 'pr.production_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      let warehouseFilter = '';
      if (warehouse_id) {
        warehouseFilter = 'AND pr.warehouse_id = ?';
        params.push(warehouse_id);
      }

      const sql = `
        SELECT 
          SUM(pr.wastage_kg) as total_wastage_kg,
          AVG(pr.wastage_percentage) as avg_wastage_percentage,
          SUM(pr.purchased_kg) as total_purchased_kg,
          SUM(pr.production_kg) as total_production_kg,
          COUNT(DISTINCT pr.purchase_order_id) as total_purchase_orders,
          COUNT(DISTINCT pr.product_id) as total_products_affected
        FROM production_records pr
        WHERE ${dateFilter} ${warehouseFilter}
      `;

      const [summary] = await executeQuery(sql, params);

      res.json({
        success: true,
        data: {
          total_wastage_kg: parseFloat(summary.total_wastage_kg || 0).toFixed(3),
          avg_wastage_percentage: parseFloat(summary.avg_wastage_percentage || 0).toFixed(2),
          total_purchased_kg: parseFloat(summary.total_purchased_kg || 0).toFixed(3),
          total_production_kg: parseFloat(summary.total_production_kg || 0).toFixed(3),
          total_purchase_orders: summary.total_purchase_orders || 0,
          total_products_affected: summary.total_products_affected || 0
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== WASTAGE BY PURCHASE ORDER ====================
  async getWastageByPurchase(req, res, next) {
    try {
      const { start_date, end_date, warehouse_id, supplier_id } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND po.order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (warehouse_id) {
        where += ' AND po.warehouse_id = ?';
        params.push(warehouse_id);
      }

      if (supplier_id) {
        where += ' AND po.supplier_id = ?';
        params.push(supplier_id);
      }

      const sql = `
        SELECT 
          po.id as purchase_order_id,
          po.po_number,
          po.order_date,
          po.production_date,
          c.company_name as supplier_name,
          w.name as warehouse_name,
          COUNT(pr.id) as total_products,
          SUM(pr.purchased_kg) as total_purchased_kg,
          SUM(pr.production_kg) as total_production_kg,
          SUM(pr.wastage_kg) as total_wastage_kg,
          AVG(pr.wastage_percentage) as avg_wastage_percentage
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN warehouses w ON po.warehouse_id = w.id
        LEFT JOIN production_records pr ON po.id = pr.purchase_order_id
        WHERE ${where}
          AND po.is_production_completed = 1
        GROUP BY po.id, po.po_number, po.order_date, po.production_date, 
                 c.company_name, w.name
        ORDER BY po.production_date DESC
      `;

      const wastageByPurchase = await executeQuery(sql, params);

      wastageByPurchase.forEach(row => {
        row.total_purchased_kg = parseFloat(row.total_purchased_kg || 0).toFixed(3);
        row.total_production_kg = parseFloat(row.total_production_kg || 0).toFixed(3);
        row.total_wastage_kg = parseFloat(row.total_wastage_kg || 0).toFixed(3);
        row.avg_wastage_percentage = parseFloat(row.avg_wastage_percentage || 0).toFixed(2);
      });

      res.json({
        success: true,
        data: wastageByPurchase
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== WASTAGE BY PRODUCT ====================
  async getWastageByProduct(req, res, next) {
    try {
      const { start_date, end_date, warehouse_id, product_id } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND pr.production_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (warehouse_id) {
        where += ' AND pr.warehouse_id = ?';
        params.push(warehouse_id);
      }

      if (product_id) {
        where += ' AND pr.product_id = ?';
        params.push(product_id);
      }

      const sql = `
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.sku,
          COUNT(pr.id) as total_transactions,
          SUM(pr.purchased_kg) as total_purchased_kg,
          SUM(pr.production_kg) as total_production_kg,
          SUM(pr.wastage_kg) as total_wastage_kg,
          AVG(pr.wastage_percentage) as avg_wastage_percentage,
          MIN(pr.wastage_percentage) as min_wastage_percentage,
          MAX(pr.wastage_percentage) as max_wastage_percentage
        FROM production_records pr
        INNER JOIN products p ON pr.product_id = p.id
        WHERE ${where}
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_wastage_kg DESC
      `;

      const wastageByProduct = await executeQuery(sql, params);

      wastageByProduct.forEach(row => {
        row.total_purchased_kg = parseFloat(row.total_purchased_kg || 0).toFixed(3);
        row.total_production_kg = parseFloat(row.total_production_kg || 0).toFixed(3);
        row.total_wastage_kg = parseFloat(row.total_wastage_kg || 0).toFixed(3);
        row.avg_wastage_percentage = parseFloat(row.avg_wastage_percentage || 0).toFixed(2);
        row.min_wastage_percentage = parseFloat(row.min_wastage_percentage || 0).toFixed(2);
        row.max_wastage_percentage = parseFloat(row.max_wastage_percentage || 0).toFixed(2);
      });

      res.json({
        success: true,
        data: wastageByProduct
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== DETAILED WASTAGE REPORT ====================
  async getDetailedWastageReport(req, res, next) {
    try {
      const { 
        start_date, 
        end_date, 
        warehouse_id, 
        product_id, 
        purchase_order_id,
        limit = 100,
        offset = 0
      } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND pr.production_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (warehouse_id) {
        where += ' AND pr.warehouse_id = ?';
        params.push(warehouse_id);
      }

      if (product_id) {
        where += ' AND pr.product_id = ?';
        params.push(product_id);
      }

      if (purchase_order_id) {
        where += ' AND pr.purchase_order_id = ?';
        params.push(purchase_order_id);
      }

      const sql = `
        SELECT 
          pr.id,
          pr.production_number,
          pr.production_date,
          pr.purchased_kg,
          pr.production_kg,
          pr.wastage_kg,
          pr.wastage_percentage,
          pr.notes,
          p.name as product_name,
          p.sku as product_sku,
          po.po_number,
          po.order_date as purchase_date,
          c.company_name as supplier_name,
          w.name as warehouse_name
        FROM production_records pr
        INNER JOIN products p ON pr.product_id = p.id
        INNER JOIN purchase_orders po ON pr.purchase_order_id = po.id
        LEFT JOIN clients c ON po.supplier_id = c.id
        INNER JOIN warehouses w ON pr.warehouse_id = w.id
        WHERE ${where}
        ORDER BY pr.production_date DESC, pr.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const records = await executeQuery(sql, [...params, parseInt(limit), parseInt(offset)]);

      records.forEach(row => {
        row.purchased_kg = parseFloat(row.purchased_kg || 0).toFixed(3);
        row.production_kg = parseFloat(row.production_kg || 0).toFixed(3);
        row.wastage_kg = parseFloat(row.wastage_kg || 0).toFixed(3);
        row.wastage_percentage = parseFloat(row.wastage_percentage || 0).toFixed(2);
      });

      // Get total count
      const countSql = `
        SELECT COUNT(*) as total
        FROM production_records pr
        WHERE ${where}
      `;
      const [{ total }] = await executeQuery(countSql, params);

      res.json({
        success: true,
        data: {
          records,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WastageReportController();