const { executeQuery } = require('../config/database');

class EnhancedReportController {

  // ==================== SALES REPORT ====================
  async getSalesReport(req, res, next) {
    try {
      const {
        start_date,
        end_date,
        customer_id,
        warehouse_id,
        payment_method,
        group_by = 'day'
      } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (customer_id) {
        where += ' AND customer_id = ?';
        params.push(customer_id);
      }

      if (warehouse_id) {
        where += ' AND warehouse_id = ?';
        params.push(warehouse_id);
      }

      if (payment_method) {
        where += ' AND payment_method = ?';
        params.push(payment_method);
      }

      const sql = `
        SELECT * FROM vw_sales_report
        WHERE ${where}
        ORDER BY order_date DESC
      `;

      const sales = await executeQuery(sql, params);

      // Calculate summary
      const summary = {
        total_orders: sales.length,
        total_sales: sales.reduce((sum, s) => sum + parseFloat(s.total_amount), 0),
        total_paid: sales.reduce((sum, s) => sum + parseFloat(s.paid_amount || 0), 0),
        total_kg: sales.reduce((sum, s) => sum + parseFloat(s.total_kg || 0), 0),
        by_payment_method: {
          cash: sales.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.paid_amount || 0), 0),
          bank: sales.filter(s => s.payment_method === 'bank').reduce((sum, s) => sum + parseFloat(s.paid_amount || 0), 0),
          cheque: sales.filter(s => s.payment_method === 'cheque').reduce((sum, s) => sum + parseFloat(s.paid_amount || 0), 0)
        },
        by_status: {}
      };

      // Group by status
      sales.forEach(s => {
        if (!summary.by_status[s.status]) {
          summary.by_status[s.status] = { count: 0, amount: 0 };
        }
        summary.by_status[s.status].count++;
        summary.by_status[s.status].amount += parseFloat(s.total_amount);
      });

      res.json({
        success: true,
        data: {
          sales,
          summary
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== PURCHASE REPORT ====================
  async getPurchaseReport(req, res, next) {
    try {
      const {
        start_date,
        end_date,
        supplier_id,
        warehouse_id,
        payment_method,
        production_status
      } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (supplier_id) {
        where += ' AND c.id = ?';
        params.push(supplier_id);
      }

      if (warehouse_id) {
        where += ' AND warehouse_id = ?';
        params.push(warehouse_id);
      }

      if (payment_method) {
        where += ' AND payment_method = ?';
        params.push(payment_method);
      }

      if (production_status === 'completed') {
        where += ' AND is_production_completed = 1';
      } else if (production_status === 'pending') {
        where += ' AND is_production_completed = 0';
      }

      const sql = `
        SELECT * FROM vw_purchase_report
        WHERE ${where}
        ORDER BY order_date DESC
      `;

      const purchases = await executeQuery(sql, params);

      // Calculate summary
      const summary = {
        total_orders: purchases.length,
        total_purchases: purchases.reduce((sum, p) => sum + parseFloat(p.total_amount), 0),
        total_paid: purchases.reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0),
        total_purchased_kg: purchases.reduce((sum, p) => sum + parseFloat(p.total_purchased_kg || 0), 0),
        total_production_kg: purchases.reduce((sum, p) => sum + parseFloat(p.production_kg || 0), 0),
        total_wastage_kg: purchases.reduce((sum, p) => sum + parseFloat(p.wastage_kg || 0), 0),
        avg_wastage_percentage: purchases.length > 0 
          ? purchases.reduce((sum, p) => sum + parseFloat(p.wastage_percentage || 0), 0) / purchases.length 
          : 0,
        by_payment_method: {
          cash: purchases.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0),
          bank: purchases.filter(p => p.payment_method === 'bank').reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0),
          cheque: purchases.filter(p => p.payment_method === 'cheque').reduce((sum, p) => sum + parseFloat(p.paid_amount || 0), 0)
        },
        production_completed: purchases.filter(p => p.is_production_completed === 1).length,
        production_pending: purchases.filter(p => p.is_production_completed === 0).length
      };

      res.json({
        success: true,
        data: {
          purchases,
          summary
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== LEDGER REPORT ====================
  async getLedgerReport(req, res, next) {
    try {
      const {
        start_date,
        end_date,
        client_id,
        payment_method,
        transaction_type
      } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND pc.transaction_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (client_id) {
        where += ' AND pc.client_id = ?';
        params.push(client_id);
      }

      if (payment_method) {
        where += ' AND pc.payment_method = ?';
        params.push(payment_method);
      }

      if (transaction_type) {
        where += ' AND pc.transaction_type = ?';
        params.push(transaction_type);
      }

      const sql = `
        SELECT 
          pc.*,
          c.company_name,
          c.client_code,
          c.client_type,
          c.balance as current_balance,
          ba.bank_name,
          ba.account_number,
          CASE 
            WHEN pc.payment_method = 'bank' THEN CONCAT(ba.bank_name, ' - ', ba.account_number)
            WHEN pc.payment_method = 'cheque' THEN CONCAT('Cheque #', pc.cheque_number, ' (', pc.cheque_date, ')')
            ELSE 'Cash'
          END as payment_details,
          CASE 
            WHEN pc.reference_type = 'sales_order' THEN so.order_number
            WHEN pc.reference_type = 'purchase_order' THEN po.po_number
            ELSE pc.reference_type
          END as reference_number
        FROM petty_cash pc
        LEFT JOIN clients c ON pc.client_id = c.id
        LEFT JOIN bank_accounts ba ON pc.bank_account_id = ba.id
        LEFT JOIN sales_orders so ON pc.reference_type = 'sales_order' AND pc.reference_id = so.id
        LEFT JOIN purchase_orders po ON pc.reference_type = 'purchase_order' AND pc.reference_id = po.id
        WHERE ${where}
        ORDER BY pc.transaction_date DESC, pc.created_at DESC
      `;

      const ledger = await executeQuery(sql, params);

      // Calculate summary
      const summary = {
        total_transactions: ledger.length,
        total_cash_in: ledger.filter(t => t.transaction_type === 'cash_in').reduce((sum, t) => sum + parseFloat(t.amount), 0),
        total_cash_out: ledger.filter(t => t.transaction_type === 'cash_out').reduce((sum, t) => sum + parseFloat(t.amount), 0),
        by_payment_method: {
          cash: {
            cash_in: ledger.filter(t => t.payment_method === 'cash' && t.transaction_type === 'cash_in').reduce((sum, t) => sum + parseFloat(t.amount), 0),
            cash_out: ledger.filter(t => t.payment_method === 'cash' && t.transaction_type === 'cash_out').reduce((sum, t) => sum + parseFloat(t.amount), 0)
          },
          bank: {
            cash_in: ledger.filter(t => t.payment_method === 'bank' && t.transaction_type === 'cash_in').reduce((sum, t) => sum + parseFloat(t.amount), 0),
            cash_out: ledger.filter(t => t.payment_method === 'bank' && t.transaction_type === 'cash_out').reduce((sum, t) => sum + parseFloat(t.amount), 0)
          },
          cheque: {
            cash_in: ledger.filter(t => t.payment_method === 'cheque' && t.transaction_type === 'cash_in').reduce((sum, t) => sum + parseFloat(t.amount), 0),
            cash_out: ledger.filter(t => t.payment_method === 'cheque' && t.transaction_type === 'cash_out').reduce((sum, t) => sum + parseFloat(t.amount), 0)
          }
        }
      };

      summary.net_cash_flow = summary.total_cash_in - summary.total_cash_out;

      res.json({
        success: true,
        data: {
          ledger,
          summary
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ==================== STOCK REPORT ====================
  async getStockReport(req, res, next) {
    try {
      const {
        warehouse_id,
        category_id,
        stock_status
      } = req.query;

      let where = '1=1';
      let params = [];

      if (warehouse_id) {
        where += ' AND warehouse_id = ?';
        params.push(warehouse_id);
      }

      if (category_id) {
        where += ' AND pc.id = ?';
        params.push(category_id);
      }

      if (stock_status) {
        where += ' AND stock_status = ?';
        params.push(stock_status);
      }

      const sql = `
        SELECT * FROM vw_stock_report
        WHERE ${where}
        ORDER BY stock_value DESC
      `;

      const stock = await executeQuery(sql, params);

      // Calculate summary
      const summary = {
        total_products: stock.length,
        total_quantity: stock.reduce((sum, s) => sum + parseFloat(s.quantity || 0), 0),
        total_value: stock.reduce((sum, s) => sum + parseFloat(s.stock_value || 0), 0),
        by_status: {
          out_of_stock: stock.filter(s => s.stock_status === 'out_of_stock').length,
          critical: stock.filter(s => s.stock_status === 'critical').length,
          low_stock: stock.filter(s => s.stock_status === 'low_stock').length,
          normal: stock.filter(s => s.stock_status === 'normal').length
        }
      };

      res.json({
        success: true,
        data: {
          stock,
          summary
        }
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EnhancedReportController();