// src/controllers/UpdatedSalesController.js
const BaseModel = require("../models/BaseModel");
const Stock = require("../models/Stock");
const { executeTransaction, executeQuery, getConnection } = require("../config/database");

const SalesOrder = new BaseModel("sales_orders");
const PettyCash = new BaseModel("petty_cash");

async function getNextOrderNumber() {
  // Fetch last order number
  const [lastOrder] = await executeQuery(
    "SELECT order_number FROM sales_orders ORDER BY id DESC LIMIT 1",
  );

  let nextNumber = "INV001"; // default if no previous orders

  if (lastOrder && lastOrder.order_number) {
    const lastNum = parseInt(lastOrder.order_number.replace("INV", ""), 10);
    const newNum = lastNum + 1;

    // Pad with zeros, 3 digits minimum
    nextNumber = "INV" + String(newNum).padStart(3, "0");
  }

  return nextNumber;
}
class UpdatedSalesController {
  async createOrder(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const {
        customer_id,
        warehouse_id,
        items,
        make_payment = false,
        payment_date = null,
        status,
        order_date,
        delivery_date,
        shipping_charges = 0,
        notes,
      } = req.body;

      // VALIDATION - Pehle sab validate karo
      if (!customer_id) throw new Error("Customer ID is required");
      if (!warehouse_id) throw new Error("Warehouse ID is required");
      if (!items || items.length === 0)
        throw new Error("At least one item is required");
      if (!order_date) throw new Error("Order date is required");

      const BAG_WEIGHT = 10;
      const orderNumber = await getNextOrderNumber();

      // Calculate totals - BACKEND PE CALCULATE KARO, FRONTEND PE TRUST MAT KARO
      let subtotal = 0;
      let total_discount = 0;
      let total_tax = 0;

      const processedItems = items.map((item) => {
        // Validation per item
        if (!item.product_id)
          throw new Error("Product ID required for all items");
        if (!item.unit_type)
          throw new Error("Unit type required for all items");
        if (!item.quantity || item.quantity <= 0)
          throw new Error("Valid quantity required");
        if (!item.unit_price || item.unit_price <= 0)
          throw new Error("Valid unit price required");

        // Bag validation
        if (
          item.unit_type === "bag" &&
          (!item.bag_weight || item.bag_weight <= 0)
        ) {
          throw new Error("Bag weight required for bag unit type");
        }

        // Calculate total_kg
        let total_kg = 0;
        if (item.unit_type === "bag") {
          total_kg = parseFloat(item.quantity) * parseFloat(item.bag_weight);
        } else {
          total_kg = parseFloat(item.quantity);
        }

        // Price calculation
        const itemSubtotal = total_kg * parseFloat(item.unit_price);
        const itemDiscount =
          itemSubtotal * (parseFloat(item.discount_rate || 0) / 100);
        const taxableAmount = itemSubtotal - itemDiscount;
        const itemTax = taxableAmount * (parseFloat(item.tax_rate || 0) / 100);

        subtotal += itemSubtotal;
        total_discount += itemDiscount;
        total_tax += itemTax;

        return {
          ...item,
          total_kg,
          itemSubtotal,
          itemDiscount,
          itemTax,
        };
      });

      const final_subtotal = subtotal - total_discount;
      const total_amount =
        final_subtotal + total_tax + parseFloat(shipping_charges);

      // INSERT ORDER - Using connection, not executeQuery
      const [orderResult] = await connection.query(
        `INSERT INTO sales_orders 
        (order_number, customer_id, warehouse_id, order_date, delivery_date, 
         subtotal, shipping_charges, notes, tax_amount, total_amount, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderNumber,
          customer_id,
          warehouse_id,
          order_date,
          delivery_date,
          final_subtotal, // Discount k baad
          shipping_charges,
          notes || null,
          total_tax,
          total_amount,
          status || "pending",
          req.user?.id,
        ],
      );

      const orderId = orderResult.insertId;

      // INSERT ORDER ITEMS
      for (const item of processedItems) {
        await connection.query(
          `INSERT INTO sales_order_items 
          (sales_order_id, product_id, unit_type, bag_weight, 
           quantity, unit_price, tax_rate, discount_rate, total_kg)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product_id,
            item.unit_type,
            item.unit_type === "bag" ? item.bag_weight : null,
            item.quantity,
            item.unit_price,
            item.tax_rate || 0,
            item.discount_rate || 0,
            item.total_kg,
          ],
        );

        // STOCK UPDATE - Connection use karo
        await connection.query(
          `INSERT INTO stock_movements 
          (product_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_by)
          VALUES (?, ?, ?, 'out', 'sales_order', ?, ?, ?)`,
          [
            item.product_id,
            warehouse_id,
            -item.total_kg, // Negative for deduction
            orderId,
            `Sale ${orderNumber} - ${item.unit_type === "bag" ? item.quantity + " bags" : item.quantity + " kg"}`,
            req.user?.id,
          ],
        );

        // Update stock table
        await connection.query(
          `UPDATE stock SET quantity = quantity - ? 
         WHERE product_id = ? AND warehouse_id = ?`,
          [item.total_kg, item.product_id, warehouse_id],
        );
      }

      // UPDATE CUSTOMER BALANCE
      await connection.query(
        "UPDATE clients SET balance = balance + ? WHERE id = ?",
        [total_amount, customer_id],
      );

      // PAYMENT HANDLING
      if (make_payment) {
        const pcNumber = `PC-${Date.now()}`;
        await connection.query(
          `INSERT INTO petty_cash 
          (transaction_number, transaction_date, transaction_type, client_id, 
           amount, reference_type, reference_id, description, created_by)
          VALUES (?, ?, 'cash_in', ?, ?, 'sales_order', ?, ?, ?)`,
          [
            pcNumber,
            payment_date || new Date(),
            customer_id,
            total_amount,
            orderId,
            `Payment for ${orderNumber}`,
            req.user?.id,
          ],
        );

        // Deduct from balance
        await connection.query(
          "UPDATE clients SET balance = balance - ? WHERE id = ?",
          [total_amount, customer_id],
        );
      }

      // COMMIT TRANSACTION - Sab kuch successful hai to commit karo
      await connection.commit();

      // Fetch final order
      const [order] = await connection.query(
        "SELECT * FROM sales_orders WHERE id = ?",
        [orderId],
      );

      connection.release();

      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: {
          order: order[0],
          payment_received: make_payment,
        },
      });
    } catch (error) {
      // ROLLBACK - Kuch bhi fail hua to rollback
      await connection.rollback();
      connection.release();

      console.error("Order creation error:", error);

      res.status(500).json({
        success: false,
        error: error.message || "Failed to create order",
      });
    }
  }

  async getOrders(req, res, next) {
    try {
      const {
        limit = 20,
        offset = 0,
        status,
        customer_id,
        warehouse_id,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (status) {
        where += " AND so.status = ?";
        params.push(status);
      }

      if (customer_id) {
        where += " AND so.customer_id = ?";
        params.push(customer_id);
      }

      if (warehouse_id) {
        where += " AND so.warehouse_id = ?";
        params.push(warehouse_id);
      }

      const sql = `
      SELECT 
        so.*,
        c.contact_person AS customer_name,
        w.name AS warehouse_name
      FROM sales_orders so
      LEFT JOIN clients c ON so.customer_id = c.id
      LEFT JOIN warehouses w ON so.warehouse_id = w.id
      WHERE ${where}
      ORDER BY so.id DESC
      LIMIT ? OFFSET ?
    `;

      const orders = await executeQuery(sql, [...params, limit, offset]);

      const totalSql = `
      SELECT COUNT(*) as total
      FROM sales_orders so
      WHERE ${where}
    `;
      const [{ total }] = await executeQuery(totalSql, params);

      res.json({ success: true, data: { orders, total } });
    } catch (error) {
      next(error);
    }
  }

  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT so.*, 
               c.company_name as customer_name,
               c.balance as customer_balance,
               w.name as warehouse_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.customer_id = c.id
        LEFT JOIN warehouses w ON so.warehouse_id = w.id
        WHERE so.id = ?
      `;

      const [order] = await executeQuery(sql, [id]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Order not found",
        });
      }

      // Get items with unit details
      const itemsSql = `
        SELECT soi.*, 
               p.name as product_name, 
               p.sku,
               soi.unit_type,
               soi.bag_weight,
               soi.total_kg,
               (soi.total_kg * soi.unit_price) as item_total
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `;
      const items = await executeQuery(itemsSql, [id]);

      // Check if payment was received
      const paymentSql = `
        SELECT * FROM petty_cash 
        WHERE reference_type = 'sales_order' AND reference_id = ?
      `;
      const [payment] = await executeQuery(paymentSql, [id]);

      res.json({
        success: true,
        data: {
          ...order,
          items,
          payment_info: payment || null,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Sales Report with Unit-wise Breakdown
  async getSalesReport(req, res, next) {
    try {
      const { start_date, end_date, customer_id } = req.query;

      let where = "1=1";
      let params = [];

      if (start_date && end_date) {
        where += " AND so.order_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      if (customer_id) {
        where += " AND so.customer_id = ?";
        params.push(customer_id);
      }

      const sql = `
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.sku,
          SUM(CASE WHEN soi.unit_type = 'kg' THEN soi.quantity ELSE 0 END) as total_kg_direct,
          SUM(CASE WHEN soi.unit_type = 'bag' THEN soi.quantity ELSE 0 END) as total_bags,
          SUM(soi.total_kg) as total_kg_sold,
          COUNT(DISTINCT so.id) as order_count,
          SUM(soi.total_kg * soi.unit_price) as total_revenue
        FROM sales_orders so
        INNER JOIN sales_order_items soi ON so.id = soi.sales_order_id
        INNER JOIN products p ON soi.product_id = p.id
        WHERE ${where} AND so.status = 'confirmed'
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_revenue DESC
      `;

      const report = await executeQuery(sql, params);

      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UpdatedSalesController();
