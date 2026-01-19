const BaseModel = require("../models/BaseModel");
const Stock = require("../models/Stock");
const { executeQuery, executeTransaction } = require("../config/database");

const PurchaseOrder = new BaseModel("purchase_orders");
const PurchaseOrderItem = new BaseModel("purchase_order_items");

class PurchaseController {
  async createOrder(req, res, next) {
    try {
      const {
        supplier_id,
        warehouse_id,
        items,
        expected_delivery_date,
        ...orderData
      } = req.body;

      // Generate PO number
      const poNumber = `PO-${Date.now()}`;

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
        subtotal + tax_amount - (orderData.discount_amount || 0);

      // Create purchase order
      const queries = [
        {
          sql: `INSERT INTO purchase_orders 
              (po_number, supplier_id, warehouse_id, order_date, expected_delivery_date,
               subtotal, tax_amount, total_amount, status, created_by)
              VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?, 'draft', ?)`,
          params: [
            poNumber,
            supplier_id,
            warehouse_id,
            expected_delivery_date || null,
            subtotal,
            tax_amount,
            total_amount,
            req.user?.id,
          ],
        },
      ];

      const [orderResult] = await executeTransaction(queries);
      const orderId = orderResult.insertId;

      // Create order items
      const itemQueries = items.map((item) => ({
        sql: `INSERT INTO purchase_order_items 
              (purchase_order_id, product_id, quantity, unit_price, tax_rate, discount_rate)
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

      const order = await PurchaseOrder.findById(orderId);
      res.status(201).json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  }

  async confirmOrder(req, res, next) {
    try {
      const { id } = req.params;

      await PurchaseOrder.update(id, {
        status: "confirmed",
        updated_at: new Date(),
      });

      res.json({ success: true, message: "Purchase order confirmed" });
    } catch (error) {
      next(error);
    }
  }

  async receiveOrder(req, res, next) {
    try {
      const { id } = req.params;
      const { received_items } = req.body; // Array of {product_id, received_quantity}

      const order = await PurchaseOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Purchase order not found",
        });
      }

      if (order.status !== "confirmed") {
        return res.status(400).json({
          success: false,
          error: "Order must be confirmed before receiving",
        });
      }

      // Get order items
      const itemsSql = `SELECT * FROM purchase_order_items WHERE purchase_order_id = ?`;
      const items = await executeQuery(itemsSql, [id]);

      // Update stock for received items
      for (const receivedItem of received_items) {
        const orderItem = items.find(
          (i) => i.product_id === receivedItem.product_id,
        );

        if (orderItem) {
          await Stock.updateStock(
            receivedItem.product_id,
            order.warehouse_id,
            receivedItem.received_quantity,
            "purchase",
            {
              reference_type: "purchase_order",
              reference_id: id,
              created_by: req.user?.id,
            },
          );
        }
      }

      // Update order status
      await PurchaseOrder.update(id, { status: "received" });

      res.json({ success: true, message: "Stock received successfully" });
    } catch (error) {
      next(error);
    }
  }

  // async getOrders(req, res, next) {
  //   try {
  //     const { limit = 20, offset = 0, status, supplier_id } = req.query;

  //     let where = "1=1";
  //     let params = [];

  //     if (status) {
  //       where += " AND status = ?";
  //       params.push(status);
  //     }

  //     if (supplier_id) {
  //       where += " AND supplier_id = ?";
  //       params.push(supplier_id);
  //     }

  //     const orders = await PurchaseOrder.findAll({
  //       limit,
  //       offset,
  //       where,
  //       params,
  //       orderBy: "order_date DESC",
  //     });

  //     const total = await PurchaseOrder.count(where, params);

  //     res.json({ success: true, data: { orders, total } });
  //   } catch (error) {
  //     next(error);
  //   }
  // }

  async getOrders(req, res, next) {
    try {
      const {
        limit = 20,
        offset = 0,
        status,
        supplier_id,
        warehouse_id,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (status) {
        where += " AND po.status = ?";
        params.push(status);
      }

      if (supplier_id) {
        where += " AND po.supplier_id = ?";
        params.push(supplier_id);
      }

      if (warehouse_id) {
        where += " AND po.warehouse_id = ?";
        params.push(warehouse_id);
      }

      const sql = `
      SELECT 
        po.*,
        c.contact_person AS supplier_name,
        w.name AS warehouse_name
      FROM purchase_orders po
      LEFT JOIN clients c ON po.supplier_id = c.id
      LEFT JOIN warehouses w ON po.warehouse_id = w.id
      WHERE ${where}
      ORDER BY po.order_date DESC
      LIMIT ? OFFSET ?
    `;

      const orders = await executeQuery(sql, [...params, limit, offset]);

      const totalSql = `
      SELECT COUNT(*) as total
      FROM purchase_orders po
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

      const order = await PurchaseOrder.findById(id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Purchase order not found",
        });
      }

      // Get supplier info
      const supplierSql = `SELECT * FROM clients WHERE id = ?`;
      const [supplier] = await executeQuery(supplierSql, [order.supplier_id]);

      // Get items
      const itemsSql = `
        SELECT poi.*, p.name as product_name, p.sku, p.unit_type
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.purchase_order_id = ?
      `;
      const items = await executeQuery(itemsSql, [id]);

      res.json({
        success: true,
        data: { ...order, supplier, items },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateOrder(req, res, next) {
    try {
      const { id } = req.params;
      const order = await PurchaseOrder.update(id, req.body);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Purchase order not found",
        });
      }

      res.json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  }

  async cancelOrder(req, res, next) {
    try {
      const { id } = req.params;

      await PurchaseOrder.update(id, { status: "cancelled" });

      res.json({ success: true, message: "Purchase order cancelled" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PurchaseController();
