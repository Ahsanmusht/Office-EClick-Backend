const { executeQuery } = require('../config/database');

class DashboardController {
  async getDashboardStats(req, res, next) {
    try {
      const { start_date, end_date, chart_type = 'sales', chart_start_date, chart_end_date } = req.query;
      
      // Default to last 30 days if no dates provided (for boxes)
      const dateFilter = start_date && end_date 
        ? `BETWEEN '${start_date}' AND '${end_date}'`
        : `>= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
      
      // Chart date filter - defaults to current month
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const chartStartDate = chart_start_date || firstDayOfMonth.toISOString().split('T')[0];
      const chartEndDate = chart_end_date || lastDayOfMonth.toISOString().split('T')[0];
      
      // 1. SALES STATS
      const salesSql = `
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_sales,
          COALESCE(AVG(total_amount), 0) as avg_order_value,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as completed_orders
        FROM sales_orders
        WHERE order_date ${dateFilter}
      `;
      const [salesStats] = await executeQuery(salesSql);
      
      // 2. PURCHASE STATS
      const purchaseSql = `
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(total_amount), 0) as total_purchases
        FROM purchase_orders
        WHERE order_date ${dateFilter}
      `;
      const [purchaseStats] = await executeQuery(purchaseSql);
      
      // 3. INVENTORY STATS
      const inventorySql = `
        SELECT 
          COUNT(DISTINCT s.product_id) as total_products,
          COALESCE(SUM(s.quantity), 0) as total_stock_quantity,
          COUNT(CASE WHEN quantity <= 10 THEN 1 END) as low_stock_products
        FROM stock s
        LEFT JOIN products p ON s.product_id = p.id
      `;
      const [inventoryStats] = await executeQuery(inventorySql);
      
      // 4. FINANCIAL STATS
      const financialSql = `
        SELECT 
          COALESCE(SUM(CASE WHEN transaction_type = 'cash_in' THEN amount ELSE 0 END), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN transaction_type = 'cash_out' THEN amount ELSE 0 END), 0) as total_expenses
        FROM petty_cash
        WHERE transaction_date ${dateFilter}
      `;
      const [financialStats] = await executeQuery(financialSql);

      // 5. CLIENT BALANCES
      const clientBalancesSql = `
        SELECT 
          COALESCE(SUM(CASE WHEN client_type = 'customer' AND balance > 0 THEN balance ELSE 0 END), 0) as receivables,
          COALESCE(SUM(CASE WHEN client_type = 'supplier' AND balance > 0 THEN balance ELSE 0 END), 0) as payables
        FROM clients
        WHERE is_active = 1
      `;
      const [clientBalances] = await executeQuery(clientBalancesSql);

      // 6. DYNAMIC CHART DATA based on chart_type
      let chartData = [];
      
      if (chart_type === 'sales') {
        const chartSql = `
          SELECT 
            DATE(order_date) as date,
            COALESCE(SUM(total_amount), 0) as amount
          FROM sales_orders
          WHERE order_date BETWEEN ? AND ?
          GROUP BY DATE(order_date)
          ORDER BY date ASC
        `;
        chartData = await executeQuery(chartSql, [chartStartDate, chartEndDate]);
      } 
      else if (chart_type === 'purchase') {
        const chartSql = `
          SELECT 
            DATE(order_date) as date,
            COALESCE(SUM(total_amount), 0) as amount
          FROM purchase_orders
          WHERE order_date BETWEEN ? AND ?
          GROUP BY DATE(order_date)
          ORDER BY date ASC
        `;
        chartData = await executeQuery(chartSql, [chartStartDate, chartEndDate]);
      }
      else if (chart_type === 'wastage') {
        const chartSql = `
          SELECT 
            DATE(pr.production_date) as date,
            COALESCE(SUM(pr.wastage_kg), 0) as amount
          FROM production_records pr
          WHERE pr.production_date BETWEEN ? AND ?
          GROUP BY DATE(pr.production_date)
          ORDER BY date ASC
        `;
        chartData = await executeQuery(chartSql, [chartStartDate, chartEndDate]);
      }

      const netProfit = parseFloat(financialStats.total_revenue) - parseFloat(financialStats.total_expenses);
      
      res.json({
        success: true,
        data: {
          boxes: {
            total_sales: {
              value: parseFloat(salesStats.total_sales || 0).toFixed(2),
              count: salesStats.total_orders || 0,
              percentage: 0,
              label: 'Total Sales'
            },
            total_purchases: {
              value: parseFloat(purchaseStats.total_purchases || 0).toFixed(2),
              count: purchaseStats.total_orders || 0,
              percentage: 0,
              label: 'Total Purchases'
            },
            net_profit: {
              value: netProfit.toFixed(2),
              percentage: 0,
              label: 'Net Profit'
            },
            inventory_value: {
              value: inventoryStats.total_stock_quantity || 0,
              low_stock: inventoryStats.low_stock_products || 0,
              label: 'Stock Items'
            }
          },
          chart: {
            type: chart_type,
            start_date: chartStartDate,
            end_date: chartEndDate,
            labels: chartData.map(d => new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })),
            data: chartData.map(d => parseFloat(d.amount))
          },
          summary: {
            receivables: parseFloat(clientBalances.receivables).toFixed(2),
            payables: parseFloat(clientBalances.payables).toFixed(2),
            net_position: (parseFloat(clientBalances.receivables) - parseFloat(clientBalances.payables)).toFixed(2)
          }
        }
      });
      
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();