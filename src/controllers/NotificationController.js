const BaseModel = require("../models/BaseModel");
const { executeQuery } = require("../config/database");

const Notification = new BaseModel("notifications");
const StockAlert = new BaseModel("stock_alerts");

class NotificationController {
  async getUserNotifications(req, res, next) {
    try {
      const { limit = 20, offset = 0, is_read } = req.query;

      let where = "user_id = ? OR user_id IS NULL";
      let params = [req.user.id];

      if (is_read !== undefined) {
        where += " AND is_read = ?";
        params.push(is_read);
      }

      const notifications = await Notification.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "created_at DESC",
      });

      const total = await Notification.count(where, params);
      const unread = await Notification.count("user_id = ? AND is_read = 0", [
        req.user.id,
      ]);

      res.json({ success: true, data: { notifications, total, unread } });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;

      await Notification.update(id, {
        is_read: 1,
        read_at: new Date(),
      });

      res.json({ success: true, message: "Notification marked as read" });
    } catch (error) {
      next(error);
    }
  }

  async markAllAsRead(req, res, next) {
    try {
      const sql = `UPDATE notifications 
                   SET is_read = 1, read_at = NOW() 
                   WHERE user_id = ? AND is_read = 0`;

      await executeQuery(sql, [req.user.id]);

      res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
      next(error);
    }
  }

  async createNotification(req, res, next) {
    try {
      const {
        user_id,
        notification_type,
        title,
        message,
        reference_type,
        reference_id,
      } = req.body;

      const notification = await Notification.create({
        user_id: user_id || null, // null means broadcast to all
        notification_type,
        title,
        message,
        reference_type,
        reference_id,
        is_read: 0,
      });

      res.status(201).json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  }

  // Stock Alerts
  async checkAndCreateStockAlerts(req, res, next) {
    try {
      // Get products with low stock
      const sql = `
        SELECT s.*, p.name, p.reorder_level, w.name as warehouse_name
        FROM stock s
        JOIN products p ON s.product_id = p.id
        JOIN warehouses w ON s.warehouse_id = w.id
        WHERE s.available_quantity <= p.reorder_level
        AND s.available_quantity > 0
        AND NOT EXISTS (
          SELECT 1 FROM stock_alerts sa
          WHERE sa.product_id = s.product_id 
          AND sa.warehouse_id = s.warehouse_id
          AND sa.alert_type = 'low_stock'
          AND sa.is_resolved = 0
        )
      `;

      const lowStockItems = await executeQuery(sql);

      const alertQueries = [];
      const notificationQueries = [];

      for (const item of lowStockItems) {
        // Create stock alert
        alertQueries.push({
          sql: `INSERT INTO stock_alerts 
                (product_id, warehouse_id, alert_type, alert_date, 
                 current_quantity, threshold_quantity, is_resolved)
                VALUES (?, ?, 'low_stock', NOW(), ?, ?, 0)`,
          params: [
            item.product_id,
            item.warehouse_id,
            item.available_quantity,
            item.reorder_level,
          ],
        });

        // Create notification for admins
        notificationQueries.push({
          sql: `INSERT INTO notifications 
                (user_id, notification_type, title, message, reference_type, reference_id)
                VALUES (NULL, 'stock_alert', ?, ?, 'stock', ?)`,
          params: [
            `Low Stock Alert: ${item.name}`,
            `${item.name} at ${item.warehouse_name} is running low. Current: ${item.available_quantity}, Reorder level: ${item.reorder_level}`,
            item.product_id,
          ],
        });
      }

      if (alertQueries.length > 0) {
        await executeTransaction(alertQueries);
        await executeTransaction(notificationQueries);
      }

      res.json({
        success: true,
        message: `Created ${lowStockItems.length} stock alerts`,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStockAlerts(req, res, next) {
    try {
      const { is_resolved, warehouse_id, limit = 50, offset = 0 } = req.query;

      let where = "1=1";
      let params = [];

      if (is_resolved !== undefined) {
        where += " AND is_resolved = ?";
        params.push(is_resolved);
      }

      if (warehouse_id) {
        where += " AND warehouse_id = ?";
        params.push(warehouse_id);
      }

      const sql = `
        SELECT sa.*, p.name as product_name, p.sku, w.name as warehouse_name
        FROM stock_alerts sa
        JOIN products p ON sa.product_id = p.id
        JOIN warehouses w ON sa.warehouse_id = w.id
        WHERE ${where}
        ORDER BY sa.alert_date DESC
        LIMIT ? OFFSET ?
      `;

      const alerts = await executeQuery(sql, [
        ...params,
        parseInt(limit),
        parseInt(offset),
      ]);
      const total = await StockAlert.count(where, params);

      res.json({ success: true, data: { alerts, total } });
    } catch (error) {
      next(error);
    }
  }

  async resolveStockAlert(req, res, next) {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      await StockAlert.update(id, {
        is_resolved: 1,
        resolved_at: new Date(),
        resolved_by: req.user?.id,
        notes,
      });

      res.json({ success: true, message: "Stock alert resolved" });
    } catch (error) {
      next(error);
    }
  }
}

// ==================== PeriodClosingController.js ====================

const PeriodClosing = new BaseModel("period_closings");

class PeriodClosingController {
  async closePeriod(req, res, next) {
    try {
      const { closing_month } = req.body; // Format: YYYY-MM-01

      // Check if already closed
      const existingSql = `SELECT * FROM period_closings WHERE closing_month = ?`;
      const [existing] = await executeQuery(existingSql, [closing_month]);

      if (existing) {
        return res.status(400).json({
          success: false,
          error: "Period already closed",
        });
      }

      // Calculate month start and end
      const monthStart = closing_month;
      const monthEnd = new Date(closing_month);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      monthEnd.setDate(monthEnd.getDate() - 1);
      const monthEndStr = monthEnd.toISOString().split("T")[0];

      // Get sales
      const salesSql = `
        SELECT COALESCE(SUM(total_amount), 0) as total_sales
        FROM sales_orders
        WHERE order_date BETWEEN ? AND ?
        AND status != 'cancelled'
      `;
      const [sales] = await executeQuery(salesSql, [monthStart, monthEndStr]);

      // Get purchases
      const purchasesSql = `
        SELECT COALESCE(SUM(total_amount), 0) as total_purchases
        FROM purchase_orders
        WHERE order_date BETWEEN ? AND ?
        AND status != 'cancelled'
      `;
      const [purchases] = await executeQuery(purchasesSql, [
        monthStart,
        monthEndStr,
      ]);

      // Get expenses
      const expensesSql = `
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE expense_date BETWEEN ? AND ?
      `;
      const [expenses] = await executeQuery(expensesSql, [
        monthStart,
        monthEndStr,
      ]);

      // Get stock valuation
      const stockSql = `
        SELECT COALESCE(SUM(s.quantity * p.base_price), 0) as stock_value
        FROM stock s
        JOIN products p ON s.product_id = p.id
      `;
      const [stock] = await executeQuery(stockSql);

      const netProfit =
        parseFloat(sales.total_sales) -
        parseFloat(purchases.total_purchases) -
        parseFloat(expenses.total_expenses);

      // Create closing record
      const closing = await PeriodClosing.create({
        closing_month: monthStart,
        closing_date: new Date(),
        total_sales: sales.total_sales,
        total_purchases: purchases.total_purchases,
        total_expenses: expenses.total_expenses,
        net_profit: netProfit,
        closing_stock_value: stock.stock_value,
        status: "closed",
        closed_by: req.user?.id,
        notes: req.body.notes || null,
      });

      res.json({
        success: true,
        message: "Period closed successfully",
        data: closing,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPeriodClosings(req, res, next) {
    try {
      const { status, limit = 12, offset = 0 } = req.query;

      let where = "1=1";
      let params = [];

      if (status) {
        where += " AND status = ?";
        params.push(status);
      }

      const sql = `
        SELECT pc.*, u.full_name as closed_by_name
        FROM period_closings pc
        LEFT JOIN users u ON pc.closed_by = u.id
        WHERE ${where}
        ORDER BY pc.closing_month DESC
        LIMIT ? OFFSET ?
      `;

      const closings = await executeQuery(sql, [
        ...params,
        parseInt(limit),
        parseInt(offset),
      ]);
      const total = await PeriodClosing.count(where, params);

      res.json({ success: true, data: { closings, total } });
    } catch (error) {
      next(error);
    }
  }

  async getPeriodClosingById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT pc.*, u.full_name as closed_by_name
        FROM period_closings pc
        LEFT JOIN users u ON pc.closed_by = u.id
        WHERE pc.id = ?
      `;

      const [closing] = await executeQuery(sql, [id]);

      if (!closing) {
        return res.status(404).json({
          success: false,
          error: "Period closing not found",
        });
      }

      res.json({ success: true, data: closing });
    } catch (error) {
      next(error);
    }
  }

  async lockPeriod(req, res, next) {
    try {
      const { id } = req.params;

      const closing = await PeriodClosing.findById(id);

      if (!closing) {
        return res.status(404).json({
          success: false,
          error: "Period closing not found",
        });
      }

      if (closing.status === "locked") {
        return res.status(400).json({
          success: false,
          error: "Period already locked",
        });
      }

      await PeriodClosing.update(id, { status: "locked" });

      res.json({
        success: true,
        message: "Period locked successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async reopenPeriod(req, res, next) {
    try {
      const { id } = req.params;

      const closing = await PeriodClosing.findById(id);

      if (!closing) {
        return res.status(404).json({
          success: false,
          error: "Period closing not found",
        });
      }

      if (closing.status === "locked") {
        return res.status(400).json({
          success: false,
          error: "Cannot reopen locked period. Contact administrator.",
        });
      }

      await PeriodClosing.update(id, { status: "open" });

      res.json({
        success: true,
        message: "Period reopened successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getComparativePeriodAnalysis(req, res, next) {
    try {
      const { months = 6 } = req.query;

      const sql = `
        SELECT 
          closing_month,
          total_sales,
          total_purchases,
          total_expenses,
          net_profit,
          closing_stock_value,
          (total_sales - total_purchases - total_expenses) as calculated_profit,
          ((net_profit / NULLIF(total_sales, 0)) * 100) as profit_margin_percentage
        FROM period_closings
        WHERE status IN ('closed', 'locked')
        ORDER BY closing_month DESC
        LIMIT ?
      `;

      const periods = await executeQuery(sql, [parseInt(months)]);

      // Calculate growth rates
      for (let i = 0; i < periods.length - 1; i++) {
        const current = periods[i];
        const previous = periods[i + 1];

        current.sales_growth =
          previous.total_sales > 0
            ? (
                ((current.total_sales - previous.total_sales) /
                  previous.total_sales) *
                100
              ).toFixed(2)
            : 0;

        current.profit_growth =
          previous.net_profit > 0
            ? (
                ((current.net_profit - previous.net_profit) /
                  previous.net_profit) *
                100
              ).toFixed(2)
            : 0;
      }

      res.json({ success: true, data: periods });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  NotificationController: new NotificationController(),
  PeriodClosingController: new PeriodClosingController(),
};
