const BaseModel = require('../models/BaseModel');
const Stock = require('../models/Stock');
const { executeQuery } = require('../config/database');

const Wastage = new BaseModel('wastage_records');

class WastageController {
  
  async create(req, res, next) {
    try {
      const { product_id, warehouse_id, quantity, reason, cost_value } = req.body;
      
      const wastage = await Wastage.create({
        ...req.body,
        wastage_date: new Date().toISOString().split('T')[0],
        reported_by: req.user?.id,
        status: 'pending'
      });
      
      res.status(201).json({ success: true, data: wastage });
    } catch (error) {
      next(error);
    }
  }

  async approve(req, res, next) {
    try {
      const { id } = req.params;
      
      const wastage = await Wastage.findById(id);
      if (!wastage) {
        return res.status(404).json({ success: false, error: 'Wastage record not found' });
      }
      
      // Deduct from stock
      await Stock.updateStock(
        wastage.product_id,
        wastage.warehouse_id,
        -wastage.quantity,
        'wastage',
        { reference_type: 'wastage', reference_id: id, created_by: req.user?.id }
      );
      
      // Update status
      await Wastage.update(id, {
        status: 'approved',
        approved_by: req.user?.id
      });
      
      res.json({ success: true, message: 'Wastage approved and stock updated' });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const { limit = 20, offset = 0, status, product_id } = req.query;
      
      let where = '1=1';
      let params = [];
      
      if (status) {
        where += ' AND status = ?';
        params.push(status);
      }
      
      if (product_id) {
        where += ' AND product_id = ?';
        params.push(product_id);
      }
      
      const records = await Wastage.findAll({ limit, offset, where, params });
      const total = await Wastage.count(where, params);
      
      res.json({ success: true, data: { records, total } });
    } catch (error) {
      next(error);
    }
  }

  async getReport(req, res, next) {
    try {
      const { start_date, end_date, warehouse_id } = req.query;
      
      let sql = `SELECT w.*, p.name as product_name, p.sku, wh.name as warehouse_name
                 FROM wastage_records w
                 JOIN products p ON w.product_id = p.id
                 JOIN warehouses wh ON w.warehouse_id = wh.id
                 WHERE w.status = 'approved'`;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND w.wastage_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      if (warehouse_id) {
        sql += ' AND w.warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      sql += ' ORDER BY w.wastage_date DESC';
      
      const records = await executeQuery(sql, params);
      
      // Calculate totals
      const totalCost = records.reduce((sum, r) => sum + (parseFloat(r.cost_value) || 0), 0);
      const totalQuantity = records.reduce((sum, r) => sum + parseFloat(r.quantity), 0);
      
      res.json({ 
        success: true, 
        data: { 
          records, 
          summary: { totalCost, totalQuantity, count: records.length }
        } 
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new WastageController();