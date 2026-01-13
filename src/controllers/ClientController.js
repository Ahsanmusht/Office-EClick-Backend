const BaseModel = require("../models/BaseModel");
const { executeQuery } = require("../config/database");

const Client = new BaseModel("clients");

class ClientController {
  async getAll(req, res, next) {
    try {
      const { limit = 20, offset = 0, client_type, search } = req.query;

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
      const client = await Client.findById(id);

      if (!client) {
        return res.status(404).json({
          success: false,
          error: "Client not found",
        });
      }

      // Get client statistics
      const stats = await this.getClientStats(id);

      res.json({ success: true, data: { ...client, stats } });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      // Generate client code if not provided
      if (!req.body.client_code) {
        const prefix = req.body.client_type === "supplier" ? "SUP" : "CUS";
        req.body.client_code = `${prefix}-${Date.now()}`;
      }

      const client = await Client.create(req.body);
      res.status(201).json({ success: true, data: client });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
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
      // Soft delete
      await Client.update(id, { is_active: 0 });
      res.json({ success: true, message: "Client deleted successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getSuppliers(req, res, next) {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const where =
        'is_active = 1 AND (client_type = "supplier" OR client_type = "both")';

      const suppliers = await Client.findAll({
        limit,
        offset,
        where,
        orderBy: "company_name ASC",
      });

      const total = await Client.count(where);

      res.json({ success: true, data: { suppliers, total } });
    } catch (error) {
      next(error);
    }
  }

  async getCustomers(req, res, next) {
    try {
      const { limit = 20, offset = 0 } = req.query;

      const where =
        'is_active = 1 AND (client_type = "customer" OR client_type = "both")';

      const customers = await Client.findAll({
        limit,
        offset,
        where,
        orderBy: "company_name ASC",
      });

      const total = await Client.count(where);

      res.json({ success: true, data: { customers, total } });
    } catch (error) {
      next(error);
    }
  }

  async getClientStats(clientId) {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM purchase_orders WHERE supplier_id = ? AND status != 'cancelled') as total_purchases,
        (SELECT COUNT(*) FROM sales_orders WHERE customer_id = ? AND status != 'cancelled') as total_sales,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE client_id = ? AND invoice_type = 'purchase') as total_purchase_amount,
        (SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE client_id = ? AND invoice_type = 'sales') as total_sales_amount,
        (SELECT COALESCE(SUM(balance_amount), 0) FROM invoices WHERE client_id = ? AND status != 'paid') as outstanding_balance
    `;

    const [stats] = await executeQuery(sql, [
      clientId,
      clientId,
      clientId,
      clientId,
      clientId,
    ]);
    return stats;
  }

  async getClientTransactions(req, res, next) {
    try {
      const { id } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const sql = `
        SELECT 
          'invoice' as type,
          i.id,
          i.invoice_number as reference,
          i.invoice_date as date,
          i.total_amount,
          i.balance_amount,
          i.status
        FROM invoices i
        WHERE i.client_id = ?
        
        UNION ALL
        
        SELECT 
          'payment' as type,
          p.id,
          p.payment_number as reference,
          p.payment_date as date,
          p.amount as total_amount,
          0 as balance_amount,
          'completed' as status
        FROM payments p
        WHERE p.client_id = ?
        
        ORDER BY date DESC
        LIMIT ? OFFSET ?
      `;

      const transactions = await executeQuery(sql, [id, id, limit, offset]);

      res.json({ success: true, data: transactions });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ClientController();
