const { executeQuery } = require('../config/database');

class ReportController {
  
  // ==================== DASHBOARD STATS ====================
  
  async getDashboardStats(req, res, next) {
    try {
      const { start_date, end_date } = req.query;
      
      const dateFilter = start_date && end_date 
        ? `BETWEEN '${start_date}' AND '${end_date}'`
        : `>= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
      
      // Sales stats
      const salesSql = `
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COALESCE(AVG(total_amount), 0) as avg_order_value,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as completed_orders
        FROM sales_orders
        WHERE order_date ${dateFilter}
      `;
      const [salesStats] = await executeQuery(salesSql);
      
      // Purchase stats
      const purchaseSql = `
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_purchases
        FROM purchase_orders
        WHERE order_date ${dateFilter}
      `;
      const [purchaseStats] = await executeQuery(purchaseSql);
      
      // Inventory stats
      const inventorySql = `
        SELECT 
          COUNT(DISTINCT s.product_id) as total_products,
          COALESCE(SUM(s.quantity), 0) as total_stock_quantity,
          COUNT(CASE WHEN s.available_quantity <= p.reorder_level THEN 1 END) as low_stock_products
        FROM stock s
        LEFT JOIN products p ON s.product_id = p.id
      `;
      const [inventoryStats] = await executeQuery(inventorySql);
      
      // Financial stats
      const financialSql = `
        SELECT 
          COALESCE(SUM(CASE WHEN invoice_type = 'sales' THEN total_amount ELSE 0 END), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN invoice_type = 'sales' THEN balance_amount ELSE 0 END), 0) as outstanding_receivables,
          COALESCE(SUM(CASE WHEN invoice_type = 'purchase' THEN balance_amount ELSE 0 END), 0) as outstanding_payables
        FROM invoices
        WHERE invoice_date ${dateFilter}
      `;
      const [financialStats] = await executeQuery(financialSql);
      
      // Expense stats
      const expenseSql = `
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE expense_date ${dateFilter}
      `;
      const [expenseStats] = await executeQuery(expenseSql);
      
      res.json({
        success: true,
        data: {
          sales: salesStats,
          purchases: purchaseStats,
          inventory: inventoryStats,
          financial: {
            ...financialStats,
            total_expenses: expenseStats.total_expenses,
            net_profit: parseFloat(financialStats.total_revenue) - parseFloat(expenseStats.total_expenses)
          }
        }
      });
      
    } catch (error) {
      next(error);
    }
  }

  // ==================== SALES REPORTS ====================
  
  async getSalesReport(req, res, next) {
    try {
      const { start_date, end_date, customer_id, warehouse_id, group_by = 'day' } = req.query;
      
      let dateGroup;
      switch(group_by) {
        case 'month':
          dateGroup = 'DATE_FORMAT(order_date, "%Y-%m")';
          break;
        case 'week':
          dateGroup = 'YEARWEEK(order_date)';
          break;
        default:
          dateGroup = 'DATE(order_date)';
      }
      
      let sql = `
        SELECT 
          ${dateGroup} as period,
          COUNT(*) as order_count,
          SUM(subtotal) as subtotal,
          SUM(tax_amount) as tax_amount,
          SUM(discount_amount) as discount_amount,
          SUM(total_amount) as total_amount,
          AVG(total_amount) as avg_order_value
        FROM sales_orders
        WHERE 1=1
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      if (customer_id) {
        sql += ' AND customer_id = ?';
        params.push(customer_id);
      }
      
      if (warehouse_id) {
        sql += ' AND warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      sql += ` GROUP BY ${dateGroup} ORDER BY period DESC`;
      
      const report = await executeQuery(sql, params);
      
      res.json({ success: true, data: report });
      
    } catch (error) {
      next(error);
    }
  }

  async getTopSellingProducts(req, res, next) {
    try {
      const { start_date, end_date, limit = 10 } = req.query;
      
      let sql = `
        SELECT 
          p.id,
          p.name,
          p.sku,
          SUM(soi.quantity) as total_quantity,
          COUNT(DISTINCT soi.sales_order_id) as order_count,
          SUM(soi.total_price) as total_revenue
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        JOIN sales_orders so ON soi.sales_order_id = so.id
        WHERE so.status != 'cancelled'
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND so.order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      sql += ' GROUP BY p.id, p.name, p.sku';
      sql += ' ORDER BY total_revenue DESC';
      sql += ' LIMIT ?';
      params.push(parseInt(limit));
      
      const products = await executeQuery(sql, params);
      
      res.json({ success: true, data: products });
      
    } catch (error) {
      next(error);
    }
  }

  async getCustomerReport(req, res, next) {
    try {
      const { start_date, end_date, limit = 10 } = req.query;
      
      let sql = `
        SELECT 
          c.id,
          c.company_name,
          c.client_code,
          COUNT(so.id) as total_orders,
          SUM(so.total_amount) as total_spent,
          AVG(so.total_amount) as avg_order_value,
          MAX(so.order_date) as last_order_date
        FROM clients c
        LEFT JOIN sales_orders so ON c.id = so.customer_id
        WHERE c.client_type IN ('customer', 'both')
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND so.order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      sql += ' GROUP BY c.id, c.company_name, c.client_code';
      sql += ' ORDER BY total_spent DESC';
      sql += ' LIMIT ?';
      params.push(parseInt(limit));
      
      const customers = await executeQuery(sql, params);
      
      res.json({ success: true, data: customers });
      
    } catch (error) {
      next(error);
    }
  }

  // ==================== INVENTORY REPORTS ====================
  
  async getStockValuation(req, res, next) {
    try {
      const { warehouse_id } = req.query;
      
      let sql = `
        SELECT 
          p.id,
          p.name,
          p.sku,
          p.base_price,
          p.unit_type,
          COALESCE(SUM(s.quantity), 0) as total_quantity,
          COALESCE(SUM(s.available_quantity), 0) as available_quantity,
          COALESCE(SUM(s.quantity) * p.base_price, 0) as stock_value
        FROM products p
        LEFT JOIN stock s ON p.id = s.product_id
        WHERE p.is_active = 1
      `;
      
      const params = [];
      
      if (warehouse_id) {
        sql += ' AND s.warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      sql += ' GROUP BY p.id, p.name, p.sku, p.base_price, p.unit_type';
      sql += ' ORDER BY stock_value DESC';
      
      const valuation = await executeQuery(sql, params);
      
      const total_value = valuation.reduce((sum, item) => 
        sum + parseFloat(item.stock_value || 0), 0
      );
      
      res.json({ 
        success: true, 
        data: { 
          items: valuation,
          total_value 
        } 
      });
      
    } catch (error) {
      next(error);
    }
  }

  async getStockMovementReport(req, res, next) {
    try {
      const { start_date, end_date, product_id, warehouse_id, movement_type } = req.query;
      
      let sql = `
        SELECT 
          sm.*,
          p.name as product_name,
          p.sku,
          w.name as warehouse_name,
          u.full_name as created_by_name
        FROM stock_movements sm
        LEFT JOIN products p ON sm.product_id = p.id
        LEFT JOIN warehouses w ON sm.warehouse_id = w.id
        LEFT JOIN users u ON sm.created_by = u.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND DATE(sm.created_at) BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      if (product_id) {
        sql += ' AND sm.product_id = ?';
        params.push(product_id);
      }
      
      if (warehouse_id) {
        sql += ' AND sm.warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      if (movement_type) {
        sql += ' AND sm.movement_type = ?';
        params.push(movement_type);
      }
      
      sql += ' ORDER BY sm.created_at DESC LIMIT 500';
      
      const movements = await executeQuery(sql, params);
      
      res.json({ success: true, data: movements });
      
    } catch (error) {
      next(error);
    }
  }

  // ==================== PROFIT & LOSS ====================
  
  async getProfitLossReport(req, res, next) {
    try {
      const { start_date, end_date } = req.query;
      
      const dateFilter = start_date && end_date 
        ? `BETWEEN '${start_date}' AND '${end_date}'`
        : `>= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
      
      // Revenue (Sales)
      const revenueSql = `
        SELECT COALESCE(SUM(total_amount), 0) as total_revenue
        FROM invoices
        WHERE invoice_type = 'sales' AND invoice_date ${dateFilter}
      `;
      const [revenue] = await executeQuery(revenueSql);
      
      // Cost of Goods Sold (Purchases)
      const cogsSql = `
        SELECT COALESCE(SUM(total_amount), 0) as cogs
        FROM invoices
        WHERE invoice_type = 'purchase' AND invoice_date ${dateFilter}
      `;
      const [cogs] = await executeQuery(cogsSql);
      
      // Operating Expenses
      const expensesSql = `
        SELECT 
          ec.name as category,
          COALESCE(SUM(e.amount), 0) as amount
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.expense_date ${dateFilter}
        GROUP BY ec.name
      `;
      const expenses = await executeQuery(expensesSql);
      
      const total_expenses = expenses.reduce((sum, e) => 
        sum + parseFloat(e.amount), 0
      );
      
      // Calculations
      const gross_profit = parseFloat(revenue.total_revenue) - parseFloat(cogs.cogs);
      const net_profit = gross_profit - total_expenses;
      const gross_margin = revenue.total_revenue > 0 
        ? (gross_profit / parseFloat(revenue.total_revenue) * 100).toFixed(2)
        : 0;
      const net_margin = revenue.total_revenue > 0
        ? (net_profit / parseFloat(revenue.total_revenue) * 100).toFixed(2)
        : 0;
      
      res.json({
        success: true,
        data: {
          revenue: parseFloat(revenue.total_revenue),
          cogs: parseFloat(cogs.cogs),
          gross_profit,
          gross_margin: parseFloat(gross_margin),
          operating_expenses: expenses,
          total_expenses,
          net_profit,
          net_margin: parseFloat(net_margin)
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ReportController();