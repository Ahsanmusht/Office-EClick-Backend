const BaseModel = require('../models/BaseModel');
const Stock = require('../models/Stock');
const { executeQuery, executeTransaction } = require('../config/database');

const CuttingOperation = new BaseModel('cutting_operations');
const CuttingOutput = new BaseModel('cutting_outputs');

class CuttingController {
  
  async createOperation(req, res, next) {
    try {
      const { 
        input_product_id, 
        input_quantity, 
        warehouse_id,
        outputs, // Array of {product_id, quantity, quality_grade}
        operator_name,
        notes 
      } = req.body;
      
      // Check if enough stock available
      const stock = await Stock.getStock(input_product_id, warehouse_id);
      
      if (!stock || parseFloat(stock.available_quantity) < parseFloat(input_quantity)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Insufficient stock for cutting operation' 
        });
      }
      
      // Generate operation number
      const operationNumber = `CUT-${Date.now()}`;
      
      // Create cutting operation
      const queries = [{
        sql: `INSERT INTO cutting_operations 
              (operation_number, input_product_id, input_quantity, warehouse_id, 
               operation_date, operator_name, status, notes)
              VALUES (?, ?, ?, ?, NOW(), ?, 'pending', ?)`,
        params: [
          operationNumber, input_product_id, input_quantity, 
          warehouse_id, operator_name, notes
        ]
      }];
      
      const [result] = await executeTransaction(queries);
      const operationId = result.insertId;
      
      // Create output records
      const outputQueries = outputs.map(output => ({
        sql: `INSERT INTO cutting_outputs 
              (cutting_operation_id, output_product_id, quantity, quality_grade)
              VALUES (?, ?, ?, ?)`,
        params: [
          operationId, 
          output.product_id, 
          output.quantity, 
          output.quality_grade || 'A'
        ]
      }));
      
      await executeTransaction(outputQueries);
      
      const operation = await CuttingOperation.findById(operationId);
      res.status(201).json({ success: true, data: operation });
      
    } catch (error) {
      next(error);
    }
  }

  async processOperation(req, res, next) {
    try {
      const { id } = req.params;
      
      const operation = await CuttingOperation.findById(id);
      
      if (!operation) {
        return res.status(404).json({ 
          success: false, 
          error: 'Cutting operation not found' 
        });
      }
      
      if (operation.status !== 'pending') {
        return res.status(400).json({ 
          success: false, 
          error: 'Operation already processed' 
        });
      }
      
      // Get outputs
      const outputsSql = `SELECT * FROM cutting_outputs WHERE cutting_operation_id = ?`;
      const outputs = await executeQuery(outputsSql, [id]);
      
      const stockQueries = [];
      
      // Deduct input stock
      await Stock.updateStock(
        operation.input_product_id,
        operation.warehouse_id,
        -operation.input_quantity,
        'cutting',
        { 
          reference_type: 'cutting_operation', 
          reference_id: id,
          notes: `Cutting operation ${operation.operation_number}`
        }
      );
      
      // Add output stock
      for (const output of outputs) {
        await Stock.updateStock(
          output.output_product_id,
          operation.warehouse_id,
          output.quantity,
          'cutting',
          { 
            reference_type: 'cutting_operation', 
            reference_id: id,
            notes: `Output from ${operation.operation_number} (Grade: ${output.quality_grade})`
          }
        );
      }
      
      // Update operation status
      await CuttingOperation.update(id, { 
        status: 'completed',
        updated_at: new Date()
      });
      
      res.json({ success: true, message: 'Cutting operation processed successfully' });
      
    } catch (error) {
      next(error);
    }
  }

  async getOperations(req, res, next) {
    try {
      const { limit = 20, offset = 0, status, warehouse_id } = req.query;
      
      let where = '1=1';
      let params = [];
      
      if (status) {
        where += ' AND status = ?';
        params.push(status);
      }
      
      if (warehouse_id) {
        where += ' AND warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      const operations = await CuttingOperation.findAll({ 
        limit, 
        offset, 
        where, 
        params,
        orderBy: 'operation_date DESC'
      });
      
      const total = await CuttingOperation.count(where, params);
      
      res.json({ success: true, data: { operations, total } });
      
    } catch (error) {
      next(error);
    }
  }

  async getOperationById(req, res, next) {
    try {
      const { id } = req.params;
      
      const sql = `
        SELECT co.*, 
               p.name as input_product_name, 
               p.sku as input_sku,
               w.name as warehouse_name
        FROM cutting_operations co
        LEFT JOIN products p ON co.input_product_id = p.id
        LEFT JOIN warehouses w ON co.warehouse_id = w.id
        WHERE co.id = ?
      `;
      
      const [operation] = await executeQuery(sql, [id]);
      
      if (!operation) {
        return res.status(404).json({ 
          success: false, 
          error: 'Cutting operation not found' 
        });
      }
      
      // Get outputs
      const outputsSql = `
        SELECT co.*, p.name as product_name, p.sku
        FROM cutting_outputs co
        LEFT JOIN products p ON co.output_product_id = p.id
        WHERE co.cutting_operation_id = ?
      `;
      const outputs = await executeQuery(outputsSql, [id]);
      
      res.json({ success: true, data: { ...operation, outputs } });
      
    } catch (error) {
      next(error);
    }
  }

  async cancelOperation(req, res, next) {
    try {
      const { id } = req.params;
      
      const operation = await CuttingOperation.findById(id);
      
      if (!operation) {
        return res.status(404).json({ 
          success: false, 
          error: 'Cutting operation not found' 
        });
      }
      
      if (operation.status === 'completed') {
        return res.status(400).json({ 
          success: false, 
          error: 'Cannot cancel completed operation' 
        });
      }
      
      await CuttingOperation.update(id, { status: 'cancelled' });
      
      res.json({ success: true, message: 'Cutting operation cancelled' });
      
    } catch (error) {
      next(error);
    }
  }

  async getReport(req, res, next) {
    try {
      const { start_date, end_date, warehouse_id, input_product_id } = req.query;
      
      let sql = `
        SELECT co.*, 
               p.name as input_product_name,
               COUNT(cout.id) as output_count,
               SUM(cout.quantity) as total_output_quantity
        FROM cutting_operations co
        LEFT JOIN products p ON co.input_product_id = p.id
        LEFT JOIN cutting_outputs cout ON co.id = cout.cutting_operation_id
        WHERE co.status = 'completed'
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND DATE(co.operation_date) BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      if (warehouse_id) {
        sql += ' AND co.warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      if (input_product_id) {
        sql += ' AND co.input_product_id = ?';
        params.push(input_product_id);
      }
      
      sql += ' GROUP BY co.id ORDER BY co.operation_date DESC';
      
      const operations = await executeQuery(sql, params);
      
      res.json({ success: true, data: operations });
      
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CuttingController();