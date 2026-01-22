// src/controllers/PettyCashController.js
const BaseModel = require("../models/BaseModel");
const { executeQuery, executeTransaction } = require("../config/database");

const PettyCash = new BaseModel("petty_cash");

class PettyCashController {
  
  // Create Petty Cash Entry
  async create(req, res, next) {
    try {
      const { 
        client_id, 
        amount, 
        transaction_type, // cash_in or cash_out
        reference_type,   // sales_order, purchase_order, manual
        reference_id,
        description,
        transaction_date 
      } = req.body;

      // Generate transaction number
      const transactionNumber = `PC-${Date.now()}`;

      // Get client details
      const [client] = await executeQuery(
        'SELECT * FROM clients WHERE id = ?',
        [client_id]
      );

      if (!client) {
        return res.status(404).json({
          success: false,
          error: 'Client not found'
        });
      }

      // Create petty cash entry
      const pettyCash = await PettyCash.create({
        transaction_number: transactionNumber,
        transaction_date: transaction_date || new Date().toISOString().split('T')[0],
        transaction_type,
        client_id,
        amount,
        reference_type,
        reference_id,
        description,
        created_by: req.user?.id
      });

      // Balance will be updated by trigger, but we'll return updated balance
      const [updatedClient] = await executeQuery(
        'SELECT balance FROM clients WHERE id = ?',
        [client_id]
      );

      res.status(201).json({
        success: true,
        data: {
          ...pettyCash,
          client_name: client.company_name,
          new_balance: updatedClient.balance
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // Get All Petty Cash Transactions
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
        where += ' AND client_id = ?';
        params.push(client_id);
      }

      if (transaction_type) {
        where += ' AND transaction_type = ?';
        params.push(transaction_type);
      }

      if (start_date && end_date) {
        where += ' AND transaction_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      const sql = `
        SELECT pc.*, 
               c.company_name,
               c.client_type,
               u.full_name as created_by_name
        FROM petty_cash pc
        LEFT JOIN clients c ON pc.client_id = c.id
        LEFT JOIN users u ON pc.created_by = u.id
        WHERE ${where}
        ORDER BY pc.transaction_date DESC, pc.created_at DESC
        LIMIT ? OFFSET ?
      `;

      const transactions = await executeQuery(sql, [...params, parseInt(limit), parseInt(offset)]);
      const total = await PettyCash.count(where, params);

      // Calculate totals
      const totalsSql = `
        SELECT 
          SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END) as total_in,
          SUM(CASE WHEN transaction_type = 'cash_out' THEN amount ELSE 0 END) as total_out
        FROM petty_cash
        WHERE ${where}
      `;
      const [totals] = await executeQuery(totalsSql, params);

      res.json({
        success: true,
        data: {
          transactions,
          total,
          summary: {
            total_cash_in: parseFloat(totals.total_in || 0),
            total_cash_out: parseFloat(totals.total_out || 0),
            net_cash: parseFloat(totals.total_in || 0) - parseFloat(totals.total_out || 0)
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // Get Single Transaction
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT pc.*, 
               c.company_name,
               c.client_type,
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

  // Get Client Cash Flow
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

      // Calculate running balance
      let runningBalance = 0;
      if (transactions.length > 0) {
        runningBalance = parseFloat(transactions[0].current_balance);
      }

      res.json({
        success: true,
        data: {
          transactions,
          current_balance: runningBalance
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // Daily Cash Summary
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

  // Cash Book Report
  async getCashBook(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      const dateFilter = start_date && end_date 
        ? 'WHERE transaction_date BETWEEN ? AND ?'
        : 'WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';

      const params = start_date && end_date ? [start_date, end_date] : [];

      const sql = `
        SELECT * FROM v_petty_cash_summary ${dateFilter} ORDER BY date DESC
      `;

      const cashBook = await executeQuery(sql, params);

      res.json({ success: true, data: cashBook });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PettyCashController();