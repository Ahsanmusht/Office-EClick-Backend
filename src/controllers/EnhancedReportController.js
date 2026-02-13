// src/controllers/EnhancedReportController.js - COMPLETE ITEM DETAILS
const { executeQuery } = require("../config/database");

class EnhancedReportController {
  // ==================== ENHANCED SALES REPORT (ITEM LEVEL) ====================
  async getSalesReport(req, res, next) {
    try {
      const {
        start_date,
        end_date,
        customer_id,
        warehouse_id,
        payment_method,
        product_id,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (start_date && end_date) {
        where += " AND order_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      if (customer_id) {
        where += " AND customer_id = ?";
        params.push(customer_id);
      }

      if (warehouse_id) {
        where += " AND warehouse_id = ?";
        params.push(warehouse_id);
      }

      if (payment_method) {
        where += " AND payment_method = ?";
        params.push(payment_method);
      }

      if (product_id) {
        where += " AND product_id = ?";
        params.push(product_id);
      }

      // YE NAYA VIEW USE KAREGA - COMPLETE ITEM DETAILS KE SATH
      const sql = `
        SELECT * FROM vw_sales_report
        WHERE ${where}
        ORDER BY order_date DESC, order_id DESC, item_id ASC
      `;

      const sales = await executeQuery(sql, params);

      // Group by orders for summary (ORDER-WISE GROUPING)
      const orderGroups = {};
      sales.forEach((item) => {
        if (!orderGroups[item.order_id]) {
          orderGroups[item.order_id] = {
            order_id: item.order_id,
            order_number: item.order_number,
            order_date: item.order_date,
            customer_name: item.customer_name,
            warehouse_name: item.warehouse_name,
            order_total: parseFloat(item.order_total),
            paid_amount: parseFloat(item.paid_amount || 0),
            payment_method: item.payment_method,
            payment_details: item.payment_details,
            status: item.status,
            items: [],
          };
        }

        // ADD ITEM DETAILS
        orderGroups[item.order_id].items.push({
          item_id: item.item_id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          category_name: item.category_name,
          unit_type: item.unit_type,
          bag_weight: parseFloat(item.bag_weight || 0),
          quantity: parseFloat(item.item_quantity),
          total_kg: parseFloat(item.item_total_kg),
          unit_price: parseFloat(item.item_unit_price),
          subtotal: parseFloat(item.item_subtotal),
          tax_rate: parseFloat(item.item_tax_rate || 0),
          tax_amount: parseFloat(item.item_tax_amount || 0),
          discount_rate: parseFloat(item.item_discount_rate || 0),
          discount_amount: parseFloat(item.item_discount_amount || 0),
          total_amount: parseFloat(item.item_total_amount),
        });
      });

      const ordersArray = Object.values(orderGroups);

      // Calculate summary
      const summary = {
        total_orders: ordersArray.length,
        total_items: sales.length,
        total_sales: ordersArray.reduce((sum, o) => sum + o.order_total, 0),
        total_paid: ordersArray.reduce((sum, o) => sum + o.paid_amount, 0),
        total_kg: sales.reduce(
          (sum, s) => sum + parseFloat(s.item_total_kg || 0),
          0,
        ),
        by_payment_method: {
          cash: ordersArray
            .filter((o) => o.payment_method === "cash")
            .reduce((sum, o) => sum + o.paid_amount, 0),
          bank: ordersArray
            .filter((o) => o.payment_method === "bank")
            .reduce((sum, o) => sum + o.paid_amount, 0),
          cheque: ordersArray
            .filter((o) => o.payment_method === "cheque")
            .reduce((sum, o) => sum + o.paid_amount, 0),
        },
        by_status: {},
      };

      // Group by status
      ordersArray.forEach((o) => {
        if (!summary.by_status[o.status]) {
          summary.by_status[o.status] = { count: 0, amount: 0 };
        }
        summary.by_status[o.status].count++;
        summary.by_status[o.status].amount += o.order_total;
      });

      res.json({
        success: true,
        data: {
          orders: ordersArray, // GROUPED BY ORDER WITH ITEMS
          summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== ENHANCED PURCHASE REPORT (ITEM LEVEL) ====================
  async getPurchaseReport(req, res, next) {
    try {
      const {
        start_date,
        end_date,
        supplier_id,
        warehouse_id,
        payment_method,
        production_status,
        product_id,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (start_date && end_date) {
        where += " AND order_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      if (supplier_id) {
        where += " AND supplier_id = ?";
        params.push(supplier_id);
      }

      if (warehouse_id) {
        where += " AND warehouse_id = ?";
        params.push(warehouse_id);
      }

      if (payment_method) {
        where += " AND payment_method = ?";
        params.push(payment_method);
      }

      if (product_id) {
        where += " AND product_id = ?";
        params.push(product_id);
      }

      if (production_status === "completed") {
        where += " AND is_production_completed = 1";
      } else if (production_status === "pending") {
        where += " AND is_production_completed = 0";
      }

      const sql = `
        SELECT * FROM vw_purchase_report
        WHERE ${where}
        ORDER BY order_date DESC, order_id DESC, item_id ASC
      `;

      const purchases = await executeQuery(sql, params);

      // Group by orders
      const orderGroups = {};
      purchases.forEach((item) => {
        if (!orderGroups[item.order_id]) {
          orderGroups[item.order_id] = {
            order_id: item.order_id,
            po_number: item.po_number,
            order_date: item.order_date,
            production_date: item.production_date,
            supplier_name: item.supplier_name,
            warehouse_name: item.warehouse_name,
            order_total: parseFloat(item.order_total),
            paid_amount: parseFloat(item.paid_amount || 0),
            payment_method: item.payment_method,
            payment_details: item.payment_details,
            status: item.status,
            is_production_completed: item.is_production_completed,
            total_production_kg: parseFloat(item.total_production_kg || 0),
            total_wastage_kg: parseFloat(item.total_wastage_kg || 0),
            total_wastage_percentage: parseFloat(
              item.total_wastage_percentage || 0,
            ),
            items: [],
          };
        }

        // ADD ITEM DETAILS WITH PRODUCTION INFO
        orderGroups[item.order_id].items.push({
          item_id: item.item_id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          category_name: item.category_name,
          unit_type: item.unit_type,
          bag_weight: parseFloat(item.bag_weight || 0),
          quantity: parseFloat(item.item_quantity),
          total_kg: parseFloat(item.item_total_kg),
          unit_price: parseFloat(item.item_unit_price),
          subtotal: parseFloat(item.item_subtotal),
          tax_rate: parseFloat(item.item_tax_rate || 0),
          tax_amount: parseFloat(item.item_tax_amount || 0),
          discount_rate: parseFloat(item.item_discount_rate || 0),
          discount_amount: parseFloat(item.item_discount_amount || 0),
          total_amount: parseFloat(item.item_total_amount),
          // PRODUCTION DETAILS PER ITEM
          production_completed: item.item_production_completed === 1,
          production_number: item.production_number,
          purchased_kg: parseFloat(item.item_purchased_kg || 0),
          production_kg: parseFloat(item.item_production_kg || 0),
          wastage_kg: parseFloat(item.item_wastage_kg || 0),
          wastage_percentage: parseFloat(item.item_wastage_percentage || 0),
        });
      });

      const ordersArray = Object.values(orderGroups);

      // Calculate summary
      const summary = {
        total_orders: ordersArray.length,
        total_items: purchases.length,
        total_purchases: ordersArray.reduce((sum, o) => sum + o.order_total, 0),
        total_paid: ordersArray.reduce((sum, o) => sum + o.paid_amount, 0),
        total_purchased_kg: purchases.reduce(
          (sum, p) => sum + parseFloat(p.item_total_kg || 0),
          0,
        ),
        total_production_kg: purchases.reduce(
          (sum, p) => sum + parseFloat(p.item_production_kg || 0),
          0,
        ),
        total_wastage_kg: purchases.reduce(
          (sum, p) => sum + parseFloat(p.item_wastage_kg || 0),
          0,
        ),
        avg_wastage_percentage:
          purchases.length > 0
            ? purchases.reduce(
                (sum, p) => sum + parseFloat(p.item_wastage_percentage || 0),
                0,
              ) / purchases.length
            : 0,
        by_payment_method: {
          cash: ordersArray
            .filter((o) => o.payment_method === "cash")
            .reduce((sum, o) => sum + o.paid_amount, 0),
          bank: ordersArray
            .filter((o) => o.payment_method === "bank")
            .reduce((sum, o) => sum + o.paid_amount, 0),
          cheque: ordersArray
            .filter((o) => o.payment_method === "cheque")
            .reduce((sum, o) => sum + o.paid_amount, 0),
        },
        production_completed: ordersArray.filter(
          (o) => o.is_production_completed === 1,
        ).length,
        production_pending: ordersArray.filter(
          (o) => o.is_production_completed === 0,
        ).length,
      };

      res.json({
        success: true,
        data: {
          orders: ordersArray, // GROUPED WITH PRODUCTION DETAILS
          summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== ENHANCED LEDGER REPORT (WITH BREAKDOWN) ====================
  async getLedgerReport(req, res, next) {
    try {
      const {
        start_date,
        end_date,
        client_id,
        payment_method,
        transaction_type,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (start_date && end_date) {
        where += " AND transaction_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      if (client_id) {
        where += " AND client_id = ?";
        params.push(client_id);
      }

      if (payment_method) {
        where += " AND payment_method = ?";
        params.push(payment_method);
      }

      if (transaction_type) {
        where += " AND transaction_type = ?";
        params.push(transaction_type);
      }

      const sql = `
        SELECT * FROM vw_ledger_report
        WHERE ${where}
        ORDER BY transaction_date DESC, created_at DESC
      `;

      const ledger = await executeQuery(sql, params);

      // Calculate summary
      const summary = {
        total_transactions: ledger.length,
        total_cash_in: ledger
          .filter((t) => t.transaction_type === "cash_in")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
        total_cash_out: ledger
          .filter((t) => t.transaction_type === "cash_out")
          .reduce((sum, t) => sum + parseFloat(t.amount), 0),
        by_payment_method: {
          cash: {
            cash_in: ledger
              .filter(
                (t) =>
                  t.payment_method === "cash" &&
                  t.transaction_type === "cash_in",
              )
              .reduce((sum, t) => sum + parseFloat(t.amount), 0),
            cash_out: ledger
              .filter(
                (t) =>
                  t.payment_method === "cash" &&
                  t.transaction_type === "cash_out",
              )
              .reduce((sum, t) => sum + parseFloat(t.amount), 0),
          },
          bank: {
            cash_in: ledger
              .filter(
                (t) =>
                  t.payment_method === "bank" &&
                  t.transaction_type === "cash_in",
              )
              .reduce((sum, t) => sum + parseFloat(t.amount), 0),
            cash_out: ledger
              .filter(
                (t) =>
                  t.payment_method === "bank" &&
                  t.transaction_type === "cash_out",
              )
              .reduce((sum, t) => sum + parseFloat(t.amount), 0),
          },
          cheque: {
            cash_in: ledger
              .filter(
                (t) =>
                  t.payment_method === "cheque" &&
                  t.transaction_type === "cash_in",
              )
              .reduce((sum, t) => sum + parseFloat(t.amount), 0),
            cash_out: ledger
              .filter(
                (t) =>
                  t.payment_method === "cheque" &&
                  t.transaction_type === "cash_out",
              )
              .reduce((sum, t) => sum + parseFloat(t.amount), 0),
          },
        },
        by_reference_type: {},
      };

      // Group by reference type
      ledger.forEach((t) => {
        const refType = t.reference_type || "manual";
        if (!summary.by_reference_type[refType]) {
          summary.by_reference_type[refType] = { count: 0, amount: 0 };
        }
        summary.by_reference_type[refType].count++;
        summary.by_reference_type[refType].amount += parseFloat(t.amount);
      });

      summary.net_cash_flow = summary.total_cash_in - summary.total_cash_out;

      res.json({
        success: true,
        data: {
          ledger,
          summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== STOCK REPORT (NO CHANGES NEEDED) ====================
  async getStockReport(req, res, next) {
    try {
      const { warehouse_id, category_id, stock_status } = req.query;

      let where = "1=1";
      let params = [];

      if (warehouse_id) {
        where += " AND warehouse_id = ?";
        params.push(warehouse_id);
      }

      if (category_id) {
        where += " AND pc.id = ?";
        params.push(category_id);
      }

      if (stock_status) {
        where += " AND stock_status = ?";
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
        total_quantity: stock.reduce(
          (sum, s) => sum + parseFloat(s.quantity || 0),
          0,
        ),
        total_value: stock.reduce(
          (sum, s) => sum + parseFloat(s.stock_value || 0),
          0,
        ),
        by_status: {
          out_of_stock: stock.filter((s) => s.stock_status === "out_of_stock")
            .length,
          critical: stock.filter((s) => s.stock_status === "critical").length,
          low_stock: stock.filter((s) => s.stock_status === "low_stock").length,
          normal: stock.filter((s) => s.stock_status === "normal").length,
        },
      };

      res.json({
        success: true,
        data: {
          stock,
          summary,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EnhancedReportController();
