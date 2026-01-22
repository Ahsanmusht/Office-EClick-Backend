// src/controllers/UpdatedPurchaseController.js - PRODUCTION READY
const BaseModel = require("../models/BaseModel");
const Stock = require("../models/Stock");
const { executeQuery, getConnection } = require("../config/database");

const PurchaseOrder = new BaseModel("purchase_orders");
const PettyCash = new BaseModel("petty_cash");

// Generate unique PO number
async function getNextPONumber() {
  const [lastOrder] = await executeQuery(
    "SELECT po_number FROM purchase_orders ORDER BY id DESC LIMIT 1"
  );

  let nextNumber = "PO001";

  if (lastOrder && lastOrder.po_number) {
    const lastNum = parseInt(lastOrder.po_number.replace("PO", ""), 10);
    const newNum = lastNum + 1;
    nextNumber = "PO" + String(newNum).padStart(3, "0");
  }

  return nextNumber;
}

class UpdatedPurchaseController {
  
  async createOrder(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const {
        supplier_id,
        warehouse_id,
        items,
        wastage_type = 'percentage',
        wastage_value = 0,
        make_payment = false,
        payment_date = null,
        order_date,
        expected_delivery_date,
        notes,
      } = req.body;

      // ============================================
      // STRICT VALIDATION - FRONTEND PE TRUST MAT KARO
      // ============================================
      if (!supplier_id) throw new Error("Supplier ID is required");
      if (!warehouse_id) throw new Error("Warehouse ID is required");
      if (!items || items.length === 0) throw new Error("At least one item is required");
      if (!order_date) throw new Error("Order date is required");

      // Wastage validation
      if (!['percentage', 'quantity'].includes(wastage_type)) {
        throw new Error("Invalid wastage type. Use 'percentage' or 'quantity'");
      }
      if (wastage_value < 0) {
        throw new Error("Wastage value cannot be negative");
      }

      // Items validation
      items.forEach((item, index) => {
        if (!item.product_id) throw new Error(`Product ID required for item ${index + 1}`);
        if (!item.quantity || item.quantity <= 0) throw new Error(`Valid quantity required for item ${index + 1}`);
        if (!item.unit_price || item.unit_price <= 0) throw new Error(`Valid unit price required for item ${index + 1}`);
      });

      // Generate PO Number
      const poNumber = await getNextPONumber();

      // ============================================
      // BACKEND CALCULATION - FRONTEND SE INDEPENDENT
      // ============================================
      let subtotal = 0;
      let total_discount = 0;
      let total_tax = 0;
      let total_wastage_qty = 0;
      let total_quantity = 0;

      const processedItems = items.map((item) => {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unit_price);
        const taxRate = parseFloat(item.tax_rate || 0);
        const discountRate = parseFloat(item.discount_rate || 0);

        // Item subtotal
        const itemSubtotal = qty * price;

        // Discount calculation
        const itemDiscount = itemSubtotal * (discountRate / 100);

        // Taxable amount (after discount)
        const taxableAmount = itemSubtotal - itemDiscount;

        // Tax calculation
        const itemTax = taxableAmount * (taxRate / 100);

        // Wastage calculation per item
        let wastage_qty = 0;
        if (wastage_type === 'percentage') {
          wastage_qty = (qty * wastage_value) / 100;
        } else {
          // Distribute total wastage proportionally
          total_quantity += qty;
        }

        subtotal += itemSubtotal;
        total_discount += itemDiscount;
        total_tax += itemTax;

        return {
          ...item,
          quantity: qty,
          unit_price: price,
          tax_rate: taxRate,
          discount_rate: discountRate,
          wastage_qty: wastage_qty, // Will be recalculated for 'quantity' type
          itemSubtotal,
          itemDiscount,
          itemTax
        };
      });

      // Recalculate wastage for 'quantity' type (proportional distribution)
      if (wastage_type === 'quantity' && total_quantity > 0) {
        processedItems.forEach(item => {
          item.wastage_qty = (wastage_value * item.quantity) / total_quantity;
        });
      }

      // Calculate total wastage and net quantities
      processedItems.forEach(item => {
        total_wastage_qty += item.wastage_qty;
        item.net_qty = item.quantity - item.wastage_qty;
      });

      const final_subtotal = subtotal - total_discount;
      const total_amount = final_subtotal + total_tax;
      const actual_stock_received = items.reduce((sum, i) => sum + parseFloat(i.quantity), 0) - total_wastage_qty;

      // ============================================
      // INSERT PURCHASE ORDER - Using connection
      // ============================================
      const [orderResult] = await connection.query(
        `INSERT INTO purchase_orders 
        (po_number, supplier_id, warehouse_id, order_date, expected_delivery_date,
         subtotal, tax_amount, total_amount, 
         wastage_type, wastage_value, actual_stock_received,
         notes, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          poNumber,
          supplier_id,
          warehouse_id,
          order_date,
          expected_delivery_date || null,
          final_subtotal,
          total_tax,
          total_amount,
          wastage_type,
          wastage_value,
          actual_stock_received,
          notes || null,
          req.user?.id
        ]
      );

      const orderId = orderResult.insertId;

      // ============================================
      // INSERT ORDER ITEMS WITH WASTAGE
      // ============================================
      for (const item of processedItems) {
        await connection.query(
          `INSERT INTO purchase_order_items 
          (purchase_order_id, product_id, quantity, unit_price, 
           tax_rate, discount_rate, wastage_qty, net_qty)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product_id,
            item.quantity,
            item.unit_price,
            item.tax_rate,
            item.discount_rate,
            item.wastage_qty,
            item.net_qty
          ]
        );

        // ============================================
        // STOCK UPDATE - NET QUANTITY ONLY (After wastage)
        // ============================================
        await connection.query(
          `INSERT INTO stock_movements 
          (product_id, warehouse_id, quantity, movement_type, reference_type, reference_id, notes, created_by)
          VALUES (?, ?, ?, 'in', 'purchase_order', ?, ?, ?)`,
          [
            item.product_id,
            warehouse_id,
            item.net_qty, // Only net quantity added to stock
            orderId,
            `Purchase ${poNumber} - Ordered: ${item.quantity}kg, Wastage: ${item.wastage_qty.toFixed(3)}kg, Received: ${item.net_qty.toFixed(3)}kg`,
            req.user?.id
          ]
        );

        // Update stock table
        await connection.query(
          `INSERT INTO stock (product_id, warehouse_id, quantity) 
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
          [item.product_id, warehouse_id, item.net_qty, item.net_qty]
        );
      }

      // ============================================
      // UPDATE SUPPLIER BALANCE (Add to payable)
      // ============================================
      await connection.query(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        [total_amount, supplier_id]
      );

      // ============================================
      // PAYMENT HANDLING - If immediate payment made
      // ============================================
      if (make_payment) {
        const pcNumber = `PC-${Date.now()}`;
        await connection.query(
          `INSERT INTO petty_cash 
          (transaction_number, transaction_date, transaction_type, client_id, 
           amount, reference_type, reference_id, description, created_by)
          VALUES (?, ?, 'cash_out', ?, ?, 'purchase_order', ?, ?, ?)`,
          [
            pcNumber,
            payment_date || new Date().toISOString().split('T')[0],
            supplier_id,
            total_amount,
            orderId,
            `Payment for ${poNumber}`,
            req.user?.id
          ]
        );

        // Deduct from balance (clear payment)
        await connection.query(
          'UPDATE clients SET balance = balance - ? WHERE id = ?',
          [total_amount, supplier_id]
        );
      }

      // ============================================
      // COMMIT TRANSACTION - Sab successful hai
      // ============================================
      await connection.commit();

      // Fetch complete order with details
      const [order] = await connection.query(
        "SELECT * FROM purchase_orders WHERE id = ?",
        [orderId]
      );

      connection.release();

      res.status(201).json({
        success: true,
        message: "Purchase order created successfully",
        data: {
          order: order[0],
          wastage_summary: {
            type: wastage_type,
            value: wastage_value,
            total_wastage: total_wastage_qty.toFixed(3),
            total_ordered: items.reduce((sum, i) => sum + parseFloat(i.quantity), 0).toFixed(3),
            actual_stock_received: actual_stock_received.toFixed(3)
          },
          payment_made: make_payment
        }
      });

    } catch (error) {
      // ============================================
      // ROLLBACK - Kuch bhi fail hua to rollback
      // ============================================
      if (connection) {
        await connection.rollback();
        connection.release();
      }

      console.error("Purchase order creation error:", error);

      res.status(500).json({
        success: false,
        error: error.message || "Failed to create purchase order"
      });
    }
  }

  async getOrders(req, res, next) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        status, 
        supplier_id,
        start_date,
        end_date 
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

      if (start_date && end_date) {
        where += " AND po.order_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      const sql = `
        SELECT 
          po.*,
          c.company_name AS supplier_name,
          c.contact_person AS supplier_contact,
          w.name AS warehouse_name
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN warehouses w ON po.warehouse_id = w.id
        WHERE ${where}
        ORDER BY po.id DESC
        LIMIT ? OFFSET ?
      `;

      const orders = await executeQuery(sql, [...params, parseInt(limit), parseInt(offset)]);

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

      const sql = `
        SELECT po.*, 
               c.company_name as supplier_name,
               c.contact_person as supplier_contact,
               c.balance as supplier_balance,
               w.name as warehouse_name
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN warehouses w ON po.warehouse_id = w.id
        WHERE po.id = ?
      `;

      const [order] = await executeQuery(sql, [id]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Purchase order not found",
        });
      }

      // Get items with wastage details
      const itemsSql = `
        SELECT poi.*, 
               p.name as product_name, 
               p.sku, 
               p.unit_type,
               (poi.quantity * poi.unit_price) as item_subtotal,
               (poi.quantity * poi.unit_price * poi.discount_rate / 100) as item_discount,
               ((poi.quantity * poi.unit_price * (1 - poi.discount_rate / 100)) * poi.tax_rate / 100) as item_tax
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.purchase_order_id = ?
      `;
      const items = await executeQuery(itemsSql, [id]);

      // Check if payment was made
      const paymentSql = `
        SELECT * FROM petty_cash 
        WHERE reference_type = 'purchase_order' AND reference_id = ?
      `;
      const [payment] = await executeQuery(paymentSql, [id]);

      res.json({
        success: true,
        data: { 
          ...order, 
          items,
          payment_info: payment || null
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Wastage Report - Product-wise
  async getWastageReport(req, res, next) {
    try {
      const { product_id, start_date, end_date } = req.query;

      let where = '1=1';
      let params = [];

      if (product_id) {
        where += ' AND p.id = ?';
        params.push(product_id);
      }

      if (start_date && end_date) {
        where += ' AND po.order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      const sql = `
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.sku,
          SUM(poi.quantity) as total_purchased,
          SUM(poi.wastage_qty) as total_wastage,
          SUM(poi.net_qty) as total_received,
          AVG(
            CASE 
              WHEN po.wastage_type = 'percentage' THEN po.wastage_value
              ELSE (poi.wastage_qty / poi.quantity * 100)
            END
          ) as avg_wastage_percentage,
          COUNT(DISTINCT po.id) as purchase_count
        FROM products p
        INNER JOIN purchase_order_items poi ON p.id = poi.product_id
        INNER JOIN purchase_orders po ON poi.purchase_order_id = po.id
        WHERE ${where} AND po.status != 'cancelled'
        GROUP BY p.id, p.name, p.sku
        ORDER BY total_wastage DESC
      `;

      const report = await executeQuery(sql, params);

      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }

  // Wastage Report - Purchase-wise
  async getPurchaseWastageDetails(req, res, next) {
    try {
      const { start_date, end_date, supplier_id } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND po.order_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (supplier_id) {
        where += ' AND po.supplier_id = ?';
        params.push(supplier_id);
      }

      const sql = `
        SELECT 
          po.id,
          po.po_number,
          po.order_date,
          c.company_name as supplier_name,
          po.wastage_type,
          po.wastage_value,
          po.actual_stock_received,
          SUM(poi.quantity) as total_ordered,
          SUM(poi.wastage_qty) as total_wastage,
          SUM(poi.net_qty) as total_received,
          po.total_amount
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        WHERE ${where} AND po.status != 'cancelled'
        GROUP BY po.id, po.po_number, po.order_date, c.company_name, 
                 po.wastage_type, po.wastage_value, po.actual_stock_received, po.total_amount
        ORDER BY po.order_date DESC
      `;

      const report = await executeQuery(sql, params);

      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UpdatedPurchaseController();