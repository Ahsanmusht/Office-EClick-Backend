// src/controllers/UpdatedClientController.js
const BaseModel = require("../models/BaseModel");
const { executeQuery } = require("../config/database");

const Client = new BaseModel("clients");

class UpdatedClientController {
  async getAll(req, res, next) {
    try {
      const {
        limit = 20,
        offset = 0,
        client_type,
        search,
        has_balance,
      } = req.query;

      let where = "is_active = 1";
      let params = [];

      if (client_type) {
        where += ' AND (client_type = ? OR client_type = "both")';
        params.push(client_type);
      }

      if (search) {
        where +=
          " AND (company_name LIKE ? OR contact_person LIKE ? OR client_code LIKE ?)";
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (has_balance === "true") {
        where += " AND balance != 0";
      }

      const clients = await Client.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "company_name ASC",
      });

      const total = await Client.count(where, params);

      res.json({ success: true, data: { clients, total } });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT c.*,
               CASE 
                 WHEN c.client_type = 'customer' AND c.balance > 0 THEN 'receivable'
                 WHEN c.client_type = 'supplier' AND c.balance > 0 THEN 'payable'
                 WHEN c.balance < 0 THEN 'advance'
                 ELSE 'clear'
               END as balance_status
        FROM clients c
        WHERE c.id = ?
      `;

      const [client] = await executeQuery(sql, [id]);

      if (!client) {
        return res.status(404).json({
          success: false,
          error: "Client not found",
        });
      }

      // Get petty cash transactions
      const transactionsSql = `
        SELECT * FROM petty_cash 
        WHERE client_id = ? 
        ORDER BY transaction_date DESC 
        LIMIT 10
      `;
      const transactions = await executeQuery(transactionsSql, [id]);

      // Get summary
      const summarySql = `
        SELECT 
          COUNT(*) as total_transactions,
          SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END) as total_received,
          SUM(CASE WHEN transaction_type = 'cash_out' THEN amount ELSE 0 END) as total_paid
        FROM petty_cash
        WHERE client_id = ?
      `;
      const [summary] = await executeQuery(summarySql, [id]);

      res.json({
        success: true,
        data: {
          ...client,
          recent_transactions: transactions,
          transaction_summary: summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      // Generate client code if not provided
      if (!req.body.client_code) {
        const prefixMap = {
          supplier: "SUP",
          customer: "CUS",
          expense: "EXP",
        };
        const prefix = prefixMap[req.body.client_type] || "CLI";
        req.body.client_code = `${prefix}-${Date.now()}`;
      }

      // Balance starts at 0
      req.body.balance = 0;

      const client = await Client.create(req.body);
      res.status(201).json({ success: true, data: client });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;

      // Don't allow direct balance update through this endpoint
      delete req.body.balance;

      const client = await Client.update(id, req.body);

      if (!client) {
        return res.status(404).json({
          success: false,
          error: "Client not found",
        });
      }

      res.json({ success: true, data: client });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;

      // Check if client has balance
      const [client] = await executeQuery(
        "SELECT balance FROM clients WHERE id = ?",
        [id],
      );

      if (client && client.balance != 0) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete client with pending balance: ${client.balance}`,
        });
      }

      // Soft delete
      await Client.update(id, { is_active: 0 });
      res.json({ success: true, message: "Client deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  // Get all clients with outstanding balance
  async getOutstandingBalances(req, res, next) {
    try {
      const { client_type } = req.query;

      let where = "is_active = 1 AND balance != 0";
      let params = [];

      if (client_type) {
        where += " AND client_type = ?";
        params.push(client_type);
      }

      const sql = `
        SELECT 
          id,
          client_code,
          company_name,
          client_type,
          balance,
          CASE 
            WHEN client_type = 'customer' AND balance > 0 THEN 'receivable'
            WHEN client_type = 'supplier' AND balance > 0 THEN 'payable'
            ELSE 'advance'
          END as balance_status
        FROM clients
        WHERE ${where}
        ORDER BY ABS(balance) DESC
      `;

      const clients = await executeQuery(sql, params);

      // Calculate totals
      const totals = {
        total_receivables: 0,
        total_payables: 0,
        net_position: 0,
      };

      clients.forEach((client) => {
        const balance = parseFloat(client.balance);
        if (client.client_type === "customer" && balance > 0) {
          totals.total_receivables += balance;
        } else if (client.client_type === "supplier" && balance > 0) {
          totals.total_payables += balance;
        }
      });

      totals.net_position = totals.total_receivables - totals.total_payables;

      res.json({
        success: true,
        data: {
          clients,
          totals,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get client statement (ledger)
  async getClientStatement(req, res, next) {
    try {
      const { id } = req.params;
      const { start_date, end_date } = req.query;

      const [client] = await executeQuery(
        "SELECT * FROM clients WHERE id = ?",
        [id],
      );

      if (!client) {
        return res.status(404).json({
          success: false,
          error: "Client not found",
        });
      }

      // Get opening balance
      let openingBalance = 0;
      if (start_date) {
        const sql = `
          SELECT balance FROM clients WHERE id = ?
        `;
        // This is simplified - in production you'd calculate from transactions
        const [balance] = await executeQuery(sql, [id]);
        openingBalance = parseFloat(balance.balance || 0);
      }

      // Get all transactions
      let dateFilter = "";
      let params = [id];

      if (start_date && end_date) {
        dateFilter = "AND transaction_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      // Combine purchase/sales and petty cash
      const sql = `
        SELECT 
          'purchase' as type,
          po.po_number as reference,
          po.order_date as date,
          po.total_amount as amount,
          'debit' as entry_type,
          po.id as ref_id
        FROM purchase_orders po
        WHERE po.supplier_id = ? ${dateFilter}
        
        UNION ALL
        
        SELECT 
          'sale' as type,
          so.order_number as reference,
          so.order_date as date,
          so.total_amount as amount,
          'credit' as entry_type,
          so.id as ref_id
        FROM sales_orders so
        WHERE so.customer_id = ? ${dateFilter}
        
        UNION ALL
        
        SELECT 
          'payment' as type,
          pc.transaction_number as reference,
          pc.transaction_date as date,
          pc.amount,
          CASE 
            WHEN pc.transaction_type = 'cash_in' THEN 'credit'
            ELSE 'debit'
          END as entry_type,
          pc.id as ref_id
        FROM petty_cash pc
        WHERE pc.client_id = ? ${dateFilter}
        
        ORDER BY date ASC
      `;

      const transactions = await executeQuery(sql, [
        ...params,
        ...params,
        ...params,
      ]);

      // Calculate running balance
      let runningBalance = openingBalance;
      const statement = transactions.map((txn) => {
        if (client.client_type === "customer") {
          // For customer: sale increases balance, payment decreases
          if (txn.type === "sale") {
            runningBalance += parseFloat(txn.amount);
          } else if (txn.type === "payment") {
            runningBalance -= parseFloat(txn.amount);
          }
        } else {
          // For supplier: purchase increases balance, payment decreases
          if (txn.type === "purchase") {
            runningBalance += parseFloat(txn.amount);
          } else if (txn.type === "payment") {
            runningBalance -= parseFloat(txn.amount);
          }
        }

        return {
          ...txn,
          running_balance: runningBalance.toFixed(2),
        };
      });

      res.json({
        success: true,
        data: {
          client: {
            id: client.id,
            code: client.client_code,
            name: client.company_name,
            type: client.client_type,
          },
          opening_balance: openingBalance,
          closing_balance: client.balance,
          statement,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UpdatedClientController();
