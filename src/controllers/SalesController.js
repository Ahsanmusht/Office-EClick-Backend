const BaseModel = require("../models/BaseModel");
const Stock = require("../models/Stock");
const { executeTransaction, executeQuery } = require("../config/database");

const SalesOrder = new BaseModel("sales_orders");
const SalesOrderItem = new BaseModel("sales_order_items");

class SalesController {
  async createOrder(req, res, next) {
    try {
      const { customer_id, warehouse_id, items, ...orderData } = req.body;

      const queries = [];

      // Generate order number
      const orderNumber = `SO-${Date.now()}`;

      // Calculate totals
      let subtotal = 0;
      let tax_amount = 0;

      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        const itemTax = (itemTotal * (item.tax_rate || 0)) / 100;
        const itemDiscount = (itemTotal * (item.discount_rate || 0)) / 100;

        subtotal += itemTotal - itemDiscount;
        tax_amount += itemTax;
      }

      const total_amount =
        subtotal + tax_amount + (orderData.shipping_charges || 0);

      // Create order
      queries.push({
        sql: `INSERT INTO sales_orders 
              (order_number, customer_id, warehouse_id, order_date, subtotal, 
               tax_amount, total_amount, status, created_by)
              VALUES (?, ?, ?, CURDATE(), ?, ?, ?, 'draft', ?)`,
        params: [
          orderNumber,
          customer_id,
          warehouse_id,
          subtotal,
          tax_amount,
          total_amount,
          req.user?.id,
        ],
      });

      // We'll get the order_id after transaction
      const [orderResult] = await executeTransaction(queries);
      const orderId = orderResult.insertId;

      // Create order items
      const itemQueries = items.map((item) => ({
        sql: `INSERT INTO sales_order_items 
              (sales_order_id, product_id, quantity, unit_price, tax_rate, discount_rate)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [
          orderId,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.tax_rate || 0,
          item.discount_rate || 0,
        ],
      }));

      await executeTransaction(itemQueries);

      const order = await SalesOrder.findById(orderId);
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  }

  async confirmOrder(req, res, next) {
    try {
      const { id } = req.params;

      // Get order with items
      const order = await SalesOrder.findById(id);
      if (!order) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found" });
      }

      // Reserve stock for each item
      const itemsSql = `SELECT * FROM sales_order_items WHERE sales_order_id = ?`;
      const items = await executeQuery(itemsSql, [id]);

      for (const item of items) {
        // Reserve stock (deduct from available)
        await Stock.updateStock(
          item.product_id,
          order.warehouse_id,
          -item.quantity,
          "sale",
          { reference_type: "sales_order", reference_id: id }
        );
      }

      // Update order status
      await SalesOrder.update(id, { status: "confirmed" });

      res.json({ success: true, message: "Order confirmed successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getOrders(req, res, next) {
    try {
      const { limit = 20, offset = 0, status, customer_id } = req.query;

      let where = "1=1";
      let params = [];

      if (status) {
        where += " AND status = ?";
        params.push(status);
      }

      if (customer_id) {
        where += " AND customer_id = ?";
        params.push(customer_id);
      }

      const orders = await SalesOrder.findAll({ limit, offset, where, params });
      const total = await SalesOrder.count(where, params);

      res.json({ success: true, data: { orders, total } });
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;

      const order = await SalesOrder.findById(id);
      if (!order) {
        return res
          .status(404)
          .json({ success: false, error: "Order not found" });
      }

      // Get items
      const itemsSql = `SELECT soi.*, p.name as product_name, p.sku
                        FROM sales_order_items soi
                        JOIN products p ON soi.product_id = p.id
                        WHERE soi.sales_order_id = ?`;
      const items = await executeQuery(itemsSql, [id]);

      res.json({ success: true, data: { ...order, items } });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SalesController();
