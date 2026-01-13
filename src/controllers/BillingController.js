const BaseModel = require("../models/BaseModel");
const { executeQuery, executeTransaction } = require("../config/database");

const Invoice = new BaseModel("invoices");
const Payment = new BaseModel("payments");

class BillingController {
  // ==================== INVOICES ====================

  async createInvoice(req, res, next) {
    try {
      const {
        invoice_type,
        client_id,
        reference_type,
        reference_id,
        items,
        due_days = 30,
        ...invoiceData
      } = req.body;

      // Generate invoice number
      const prefix = invoice_type === "sales" ? "INV-S" : "INV-P";
      const invoiceNumber = `${prefix}-${Date.now()}`;

      // Calculate dates
      const invoice_date = new Date();
      const due_date = new Date();
      due_date.setDate(due_date.getDate() + due_days);

      // Calculate totals
      let subtotal = invoiceData.subtotal || 0;
      let tax_amount = invoiceData.tax_amount || 0;
      let discount_amount = invoiceData.discount_amount || 0;

      const total_amount = subtotal + tax_amount - discount_amount;

      const invoice = await Invoice.create({
        invoice_number: invoiceNumber,
        invoice_type,
        client_id,
        reference_type,
        reference_id,
        invoice_date: invoice_date.toISOString().split("T")[0],
        due_date: due_date.toISOString().split("T")[0],
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        paid_amount: 0,
        status: "draft",
        notes: invoiceData.notes,
      });

      res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async createInvoiceFromOrder(req, res, next) {
    try {
      const { order_type, order_id } = req.body; // 'sales' or 'purchase'

      let orderSql, orderItemsSql, clientIdField;

      if (order_type === "sales") {
        orderSql = "SELECT * FROM sales_orders WHERE id = ?";
        orderItemsSql =
          "SELECT * FROM sales_order_items WHERE sales_order_id = ?";
        clientIdField = "customer_id";
      } else {
        orderSql = "SELECT * FROM purchase_orders WHERE id = ?";
        orderItemsSql =
          "SELECT * FROM purchase_order_items WHERE purchase_order_id = ?";
        clientIdField = "supplier_id";
      }

      const [order] = await executeQuery(orderSql, [order_id]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      const invoiceNumber = `INV-${
        order_type === "sales" ? "S" : "P"
      }-${Date.now()}`;
      const due_date = new Date();
      due_date.setDate(due_date.getDate() + 30);

      const invoice = await Invoice.create({
        invoice_number: invoiceNumber,
        invoice_type: order_type,
        client_id: order[clientIdField],
        reference_type: `${order_type}_order`,
        reference_id: order_id,
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: due_date.toISOString().split("T")[0],
        subtotal: order.subtotal,
        tax_amount: order.tax_amount,
        discount_amount: order.discount_amount || 0,
        total_amount: order.total_amount,
        paid_amount: 0,
        status: "sent",
      });

      res.status(201).json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  async getInvoices(req, res, next) {
    try {
      const {
        limit = 20,
        offset = 0,
        status,
        invoice_type,
        client_id,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (status) {
        where += " AND status = ?";
        params.push(status);
      }

      if (invoice_type) {
        where += " AND invoice_type = ?";
        params.push(invoice_type);
      }

      if (client_id) {
        where += " AND client_id = ?";
        params.push(client_id);
      }

      const invoices = await Invoice.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "invoice_date DESC",
      });

      const total = await Invoice.count(where, params);

      res.json({ success: true, data: { invoices, total } });
    } catch (error) {
      next(error);
    }
  }

  async getInvoiceById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT i.*, c.company_name, c.contact_person, c.email, c.phone, c.address
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.id = ?
      `;

      const [invoice] = await executeQuery(sql, [id]);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found",
        });
      }

      // Get payments
      const paymentsSql = `SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC`;
      const payments = await executeQuery(paymentsSql, [id]);

      res.json({ success: true, data: { ...invoice, payments } });
    } catch (error) {
      next(error);
    }
  }

  async updateInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const invoice = await Invoice.update(id, req.body);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: "Invoice not found",
        });
      }

      res.json({ success: true, data: invoice });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PAYMENTS ====================

  async createPayment(req, res, next) {
    try {
      const { invoice_id, client_id, amount, payment_method, ...paymentData } =
        req.body;

      // Generate payment number
      const paymentNumber = `PAY-${Date.now()}`;

      const payment = await Payment.create({
        payment_number: paymentNumber,
        invoice_id,
        client_id,
        payment_date: new Date().toISOString().split("T")[0],
        amount,
        payment_method,
        transaction_id: paymentData.transaction_id,
        bank_name: paymentData.bank_name,
        cheque_number: paymentData.cheque_number,
        notes: paymentData.notes,
        created_by: req.user?.id,
      });

      // Update invoice paid amount
      if (invoice_id) {
        const invoice = await Invoice.findById(invoice_id);
        const new_paid_amount =
          parseFloat(invoice.paid_amount) + parseFloat(amount);

        let status = "partial";
        if (new_paid_amount >= parseFloat(invoice.total_amount)) {
          status = "paid";
        }

        await Invoice.update(invoice_id, {
          paid_amount: new_paid_amount,
          status,
        });
      }

      res.status(201).json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  }

  async getPayments(req, res, next) {
    try {
      const { limit = 20, offset = 0, client_id, invoice_id } = req.query;

      let where = "1=1";
      let params = [];

      if (client_id) {
        where += " AND client_id = ?";
        params.push(client_id);
      }

      if (invoice_id) {
        where += " AND invoice_id = ?";
        params.push(invoice_id);
      }

      const payments = await Payment.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "payment_date DESC",
      });

      const total = await Payment.count(where, params);

      res.json({ success: true, data: { payments, total } });
    } catch (error) {
      next(error);
    }
  }

  async getPaymentById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT p.*, c.company_name, i.invoice_number
        FROM payments p
        LEFT JOIN clients c ON p.client_id = c.id
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.id = ?
      `;

      const [payment] = await executeQuery(sql, [id]);

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: "Payment not found",
        });
      }

      res.json({ success: true, data: payment });
    } catch (error) {
      next(error);
    }
  }

  // ==================== REPORTS ====================

  async getOutstandingInvoices(req, res, next) {
    try {
      const sql = `
        SELECT i.*, c.company_name, 
               DATEDIFF(CURDATE(), i.due_date) as days_overdue
        FROM invoices i
        LEFT JOIN clients c ON i.client_id = c.id
        WHERE i.status IN ('sent', 'partial', 'overdue')
        AND i.balance_amount > 0
        ORDER BY i.due_date ASC
      `;

      const invoices = await executeQuery(sql);

      const total_outstanding = invoices.reduce(
        (sum, inv) => sum + parseFloat(inv.balance_amount),
        0
      );

      res.json({
        success: true,
        data: {
          invoices,
          total_outstanding,
          count: invoices.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BillingController();
