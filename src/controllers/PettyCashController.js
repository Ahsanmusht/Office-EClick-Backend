// src/controllers/PettyCashController.js - COMPLETE WITH CRUD
const BaseModel = require("../models/BaseModel");
const { executeQuery, executeTransaction, getConnection } = require("../config/database");

const PettyCash = new BaseModel("petty_cash");

class PettyCashController {
  
  // ==================== CREATE ====================
  async create(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { 
        client_id, 
        amount, 
        transaction_type, // cash_in or cash_out
        reference_type,   // sales_order, purchase_order, manual
        reference_id,
        description,
        transaction_date 
      } = req.body;

      // Validation
      if (!client_id || !amount || !transaction_type) {
        throw new Error('Client ID, amount, and transaction type are required');
      }

      if (!['cash_in', 'cash_out'].includes(transaction_type)) {
        throw new Error('Transaction type must be cash_in or cash_out');
      }

      // Generate transaction number
      const transactionNumber = `PC-${Date.now()}`;

      // Get client details
      const [client] = await connection.query(
        'SELECT * FROM clients WHERE id = ?',
        [client_id]
      );

      if (!client || client.length === 0) {
        throw new Error('Client not found');
      }

      // Create petty cash entry
      const [pettyCashResult] = await connection.query(
        `INSERT INTO petty_cash 
        (transaction_number, transaction_date, transaction_type, client_id, 
         amount, reference_type, reference_id, description, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionNumber,
          transaction_date || new Date().toISOString().split('T')[0],
          transaction_type,
          client_id,
          amount,
          reference_type || 'manual',
          reference_id || null,
          description || '',
          req.user?.id || 1
        ]
      );

      const pettyCashId = pettyCashResult.insertId;

      // Update client balance based on transaction type and client type
      const clientType = client[0].client_type;
      let balanceChange = 0;

      if (clientType === 'customer') {
        // Customer: cash_in reduces balance, cash_out increases balance
        balanceChange = transaction_type === 'cash_in' ? -amount : amount;
      } else if (clientType === 'supplier') {
        // Supplier: cash_out reduces balance, cash_in increases balance  
        balanceChange = transaction_type === 'cash_out' ? -amount : amount;
      }

      await connection.query(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        [balanceChange, client_id]
      );

      await connection.commit();

      // Get the complete record
      const [newRecord] = await connection.query(
        `SELECT pc.*, c.company_name, c.client_type, c.balance as client_balance
         FROM petty_cash pc
         LEFT JOIN clients c ON pc.client_id = c.id
         WHERE pc.id = ?`,
        [pettyCashId]
      );

      connection.release();

      res.status(201).json({
        success: true,
        message: 'Petty cash transaction created successfully',
        data: newRecord[0]
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Petty cash creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create petty cash transaction'
      });
    }
  }

  // ==================== UPDATE ====================
  async update(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { id } = req.params;
      const { 
        client_id, 
        amount, 
        transaction_type,
        description,
        transaction_date 
      } = req.body;

      // Get existing transaction
      const [existing] = await connection.query(
        'SELECT * FROM petty_cash WHERE id = ?',
        [id]
      );

      if (!existing || existing.length === 0) {
        throw new Error('Transaction not found');
      }

      const oldRecord = existing[0];

      // Get old client
      const [oldClient] = await connection.query(
        'SELECT * FROM clients WHERE id = ?',
        [oldRecord.client_id]
      );

      // Reverse old balance change
      let oldBalanceChange = 0;
      if (oldClient[0].client_type === 'customer') {
        oldBalanceChange = oldRecord.transaction_type === 'cash_in' ? oldRecord.amount : -oldRecord.amount;
      } else if (oldClient[0].client_type === 'supplier') {
        oldBalanceChange = oldRecord.transaction_type === 'cash_out' ? oldRecord.amount : -oldRecord.amount;
      }

      await connection.query(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        [oldBalanceChange, oldRecord.client_id]
      );

      // Update petty cash record
      await connection.query(
        `UPDATE petty_cash 
         SET client_id = ?, amount = ?, transaction_type = ?, 
             description = ?, transaction_date = ?
         WHERE id = ?`,
        [
          client_id || oldRecord.client_id,
          amount || oldRecord.amount,
          transaction_type || oldRecord.transaction_type,
          description || oldRecord.description,
          transaction_date || oldRecord.transaction_date,
          id
        ]
      );

      // Apply new balance change
      const [newClient] = await connection.query(
        'SELECT * FROM clients WHERE id = ?',
        [client_id || oldRecord.client_id]
      );

      let newBalanceChange = 0;
      const newAmount = amount || oldRecord.amount;
      const newType = transaction_type || oldRecord.transaction_type;

      if (newClient[0].client_type === 'customer') {
        newBalanceChange = newType === 'cash_in' ? -newAmount : newAmount;
      } else if (newClient[0].client_type === 'supplier') {
        newBalanceChange = newType === 'cash_out' ? -newAmount : newAmount;
      }

      await connection.query(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        [newBalanceChange, client_id || oldRecord.client_id]
      );

      await connection.commit();

      // Get updated record
      const [updatedRecord] = await connection.query(
        `SELECT pc.*, c.company_name, c.client_type, c.balance as client_balance
         FROM petty_cash pc
         LEFT JOIN clients c ON pc.client_id = c.id
         WHERE pc.id = ?`,
        [id]
      );

      connection.release();

      res.json({
        success: true,
        message: 'Petty cash transaction updated successfully',
        data: updatedRecord[0]
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Petty cash update error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update petty cash transaction'
      });
    }
  }

  // ==================== DELETE ====================
  async delete(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { id } = req.params;

      // Get existing transaction
      const [existing] = await connection.query(
        'SELECT * FROM petty_cash WHERE id = ?',
        [id]
      );

      if (!existing || existing.length === 0) {
        throw new Error('Transaction not found');
      }

      const record = existing[0];

      // Get client
      const [client] = await connection.query(
        'SELECT * FROM clients WHERE id = ?',
        [record.client_id]
      );

      // Reverse balance change
      let balanceChange = 0;
      if (client[0].client_type === 'customer') {
        balanceChange = record.transaction_type === 'cash_in' ? record.amount : -record.amount;
      } else if (client[0].client_type === 'supplier') {
        balanceChange = record.transaction_type === 'cash_out' ? record.amount : -record.amount;
      }

      await connection.query(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        [balanceChange, record.client_id]
      );

      // Delete the record
      await connection.query(
        'DELETE FROM petty_cash WHERE id = ?',
        [id]
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: 'Petty cash transaction deleted successfully'
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Petty cash delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete petty cash transaction'
      });
    }
  }

  // ==================== GET ALL ====================
  async getAll(req, res, next) {
    try {
      const { 
        limit = 50, 
        offset = 0, 
        client_id,
        transaction_type,
        start_date,
        end_date 
      } = req.query;

      let where = '1=1';
      let params = [];

      if (client_id) {
        where += ' AND pc.client_id = ?';
        params.push(client_id);
      }

      if (transaction_type) {
        where += ' AND pc.transaction_type = ?';
        params.push(transaction_type);
      }

      if (start_date && end_date) {
        where += ' AND pc.transaction_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      const sql = `
        SELECT pc.*, 
               c.company_name,
               c.client_type,
               c.contact_person,
               u.full_name as created_by_name
        FROM petty_cash pc
        LEFT JOIN clients c ON pc.client_id = c.id
        LEFT JOIN users u ON pc.created_by = u.id
        WHERE ${where}
        ORDER BY pc.transaction_date DESC, pc.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const transactions = await executeQuery(sql, [...params, parseInt(limit), parseInt(offset)]);
      
      const countSql = `
        SELECT COUNT(*) as total
        FROM petty_cash pc
        WHERE ${where}
      `;
      const [{ total }] = await executeQuery(countSql, params);

      res.json({
        success: true,
        data: {
          transactions,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== GET BY ID ====================
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT pc.*, 
               c.company_name,
               c.client_type,
               c.contact_person,
               c.balance as current_balance,
               u.full_name as created_by_name
        FROM petty_cash pc
        LEFT JOIN clients c ON pc.client_id = c.id
        LEFT JOIN users u ON pc.created_by = u.id
        WHERE pc.id = ?
      `;

      const [transaction] = await executeQuery(sql, [id]);

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'Transaction not found'
        });
      }

      res.json({ success: true, data: transaction });

    } catch (error) {
      next(error);
    }
  }

  // ==================== GET SUMMARY ====================
  async getSummary(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      let dateFilter = '';
      let params = [];

      if (start_date && end_date) {
        dateFilter = 'WHERE transaction_date BETWEEN ? AND ?';
        params = [start_date, end_date];
      } else {
        dateFilter = 'WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      }

      const sql = `
        SELECT 
          SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END) as total_cash_in,
          SUM(CASE WHEN transaction_type = 'cash_out' THEN amount ELSE 0 END) as total_cash_out,
          COUNT(CASE WHEN transaction_type = 'cash_in' THEN 1 END) as cash_in_count,
          COUNT(CASE WHEN transaction_type = 'cash_out' THEN 1 END) as cash_out_count,
          COUNT(*) as total_transactions
        FROM petty_cash
        ${dateFilter}
      `;

      const [summary] = await executeQuery(sql, params);

      summary.net_cash = parseFloat(summary.total_cash_in || 0) - parseFloat(summary.total_cash_out || 0);

      res.json({ success: true, data: summary });

    } catch (error) {
      next(error);
    }
  }

  // ==================== GET CLIENT CASH FLOW ====================
  async getClientCashFlow(req, res, next) {
    try {
      const { client_id } = req.params;
      const { start_date, end_date } = req.query;

      let dateFilter = '';
      let params = [client_id];

      if (start_date && end_date) {
        dateFilter = 'AND transaction_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      const sql = `
        SELECT 
          pc.*,
          c.company_name,
          c.balance as current_balance
        FROM petty_cash pc
        LEFT JOIN clients c ON pc.client_id = c.id
        WHERE pc.client_id = ? ${dateFilter}
        ORDER BY pc.transaction_date DESC, pc.created_at DESC
      `;

      const transactions = await executeQuery(sql, params);

      res.json({
        success: true,
        data: transactions
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== DAILY SUMMARY ====================
  async getDailySummary(req, res, next) {
    try {
      const { date } = req.query;
      const targetDate = date || new Date().toISOString().split('T')[0];

      const sql = `
        SELECT 
          transaction_type,
          COUNT(*) as count,
          SUM(amount) as total
        FROM petty_cash
        WHERE transaction_date = ?
        GROUP BY transaction_type
      `;

      const summary = await executeQuery(sql, [targetDate]);

      const response = {
        date: targetDate,
        cash_in: { count: 0, total: 0 },
        cash_out: { count: 0, total: 0 },
        net: 0
      };

      summary.forEach(item => {
        if (item.transaction_type === 'cash_in') {
          response.cash_in = { 
            count: item.count, 
            total: parseFloat(item.total) 
          };
        } else {
          response.cash_out = { 
            count: item.count, 
            total: parseFloat(item.total) 
          };
        }
      });

      response.net = response.cash_in.total - response.cash_out.total;

      res.json({ success: true, data: response });

    } catch (error) {
      next(error);
    }
  }

  // ==================== CASH BOOK ====================
  async getCashBook(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      const dateFilter = start_date && end_date 
        ? 'WHERE transaction_date BETWEEN ? AND ?'
        : 'WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';

      const params = start_date && end_date ? [start_date, end_date] : [];

      const sql = `
        SELECT 
          transaction_date as date,
          SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END) as cash_in,
          SUM(CASE WHEN transaction_type = 'cash_out' THEN amount ELSE 0 END) as cash_out,
          COUNT(*) as transactions
        FROM petty_cash
        ${dateFilter}
        GROUP BY transaction_date
        ORDER BY transaction_date DESC
      `;

      const cashBook = await executeQuery(sql, params);

      cashBook.forEach(day => {
        day.net = parseFloat(day.cash_in) - parseFloat(day.cash_out);
      });

      res.json({ success: true, data: cashBook });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PettyCashController();