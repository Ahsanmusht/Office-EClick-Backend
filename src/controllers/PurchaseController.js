// src/controllers/PurchaseController.js - COMPLETELY UPDATED

const BaseModel = require("../models/BaseModel");
const { executeQuery, getConnection } = require("../config/database");

const PurchaseOrder = new BaseModel("purchase_orders");

// Generate unique PO number
async function getNextPONumber() {
  const [lastOrder] = await executeQuery(
    "SELECT po_number FROM purchase_orders ORDER BY id DESC LIMIT 1"
  );

  let nextNumber = "PO001";
  if (lastOrder && lastOrder.po_number) {
    const lastNum = parseInt(lastOrder.po_number.replace("PO", ""), 10);
    nextNumber = "PO" + String(lastNum + 1).padStart(3, "0");
  }
  return nextNumber;
}

class UpdatedPurchaseController {
  
  // ============================================
  // CREATE PURCHASE ORDER - NO STOCK UPDATE
  // ============================================
  async createOrder(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const {
        supplier_id,
        warehouse_id,
        items,
        make_payment = false,
        payment_date = null,
        order_date,
        expected_delivery_date,
        notes,
      } = req.body;

      // VALIDATION
      if (!supplier_id) throw new Error("Supplier ID is required");
      if (!warehouse_id) throw new Error("Warehouse ID is required");
      if (!items || items.length === 0) throw new Error("At least one item is required");
      if (!order_date) throw new Error("Order date is required");

      // Validate each item
      items.forEach((item, index) => {
        if (!item.product_id) throw new Error(`Product ID required for item ${index + 1}`);
        if (!item.unit_type) throw new Error(`Unit type required for item ${index + 1}`);
        if (!item.quantity || item.quantity <= 0) throw new Error(`Valid quantity required for item ${index + 1}`);
        if (!item.unit_price || item.unit_price <= 0) throw new Error(`Valid unit price required for item ${index + 1}`);
        if (item.unit_type === 'bag' && (!item.bag_weight || item.bag_weight <= 0)) {
          throw new Error(`Bag weight required for item ${index + 1}`);
        }
      });

      const poNumber = await getNextPONumber();

      // BACKEND CALCULATION
      let subtotal = 0;
      let total_discount = 0;
      let total_tax = 0;
      let total_kg = 0;

      const processedItems = items.map((item) => {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unit_price);
        const taxRate = parseFloat(item.tax_rate || 0);
        const discountRate = parseFloat(item.discount_rate || 0);

        // Calculate total_kg
        let item_total_kg = 0;
        if (item.unit_type === 'bag') {
          item_total_kg = qty * parseFloat(item.bag_weight);
        } else {
          item_total_kg = qty;
        }

        const itemSubtotal = item_total_kg * price;
        const itemDiscount = itemSubtotal * (discountRate / 100);
        const taxableAmount = itemSubtotal - itemDiscount;
        const itemTax = taxableAmount * (taxRate / 100);

        subtotal += itemSubtotal;
        total_discount += itemDiscount;
        total_tax += itemTax;
        total_kg += item_total_kg;

        return {
          ...item,
          item_total_kg,
          itemSubtotal,
          itemDiscount,
          itemTax
        };
      });

      const final_subtotal = subtotal - total_discount;
      const total_amount = final_subtotal + total_tax;

      // INSERT PURCHASE ORDER - is_production_completed = 0
      const [orderResult] = await connection.query(
        `INSERT INTO purchase_orders 
        (po_number, supplier_id, warehouse_id, order_date, expected_delivery_date,
         subtotal, tax_amount, discount_amount, total_amount, 
         is_production_completed, notes, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending', ?)`,
        [
          poNumber,
          supplier_id,
          warehouse_id,
          order_date,
          expected_delivery_date || null,
          final_subtotal,
          total_tax,
          total_discount,
          total_amount,
          notes || null,
          req.user?.id
        ]
      );

      const orderId = orderResult.insertId;

      // INSERT ORDER ITEMS
      for (const item of processedItems) {
        await connection.query(
          `INSERT INTO purchase_order_items 
          (purchase_order_id, product_id, unit_type, bag_weight, 
           quantity, unit_price, tax_rate, discount_rate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.product_id,
            item.unit_type,
            item.unit_type === 'bag' ? item.bag_weight : null,
            item.quantity,
            item.unit_price,
            item.tax_rate || 0,
            item.discount_rate || 0
          ]
        );
      }

      // UPDATE SUPPLIER BALANCE (Add to payable)
      await connection.query(
        'UPDATE clients SET balance = balance + ? WHERE id = ?',
        [total_amount, supplier_id]
      );

      // PAYMENT HANDLING
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

        // Deduct from balance
        await connection.query(
          'UPDATE clients SET balance = balance - ? WHERE id = ?',
          [total_amount, supplier_id]
        );
      }

      await connection.commit();

      const [order] = await connection.query(
        "SELECT * FROM purchase_orders WHERE id = ?",
        [orderId]
      );

      connection.release();

      res.status(201).json({
        success: true,
        message: "Purchase order created successfully. Production pending.",
        data: {
          order: order[0],
          total_kg: total_kg.toFixed(3),
          payment_made: make_payment,
          production_status: 'pending'
        }
      });

    } catch (error) {
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

  // ============================================
  // GET PENDING PRODUCTION ORDERS
  // ============================================
  async getPendingProductionOrders(req, res, next) {
    try {
      const sql = `
        SELECT 
          po.id,
          po.po_number,
          po.order_date,
          c.company_name as supplier_name,
          w.name as warehouse_name,
          po.total_amount,
          SUM(poi.total_kg) as total_kg,
          GROUP_CONCAT(
            CONCAT(p.name, ' - ', poi.total_kg, ' kg') 
            SEPARATOR ', '
          ) as products_summary
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN warehouses w ON po.warehouse_id = w.id
        LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
        LEFT JOIN products p ON poi.product_id = p.id
        WHERE po.is_production_completed = 0
        AND po.status != 'cancelled'
        GROUP BY po.id, po.po_number, po.order_date, c.company_name, 
                 w.name, po.total_amount
        ORDER BY po.order_date DESC
      `;

      const orders = await executeQuery(sql);

      res.json({ 
        success: true, 
        data: orders 
      });

    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // GET PURCHASE DETAILS FOR PRODUCTION
  // ============================================
  async getPurchaseForProduction(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT 
          po.*,
          c.company_name as supplier_name,
          w.name as warehouse_name
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN warehouses w ON po.warehouse_id = w.id
        WHERE po.id = ? AND po.is_production_completed = 0
      `;

      const [order] = await executeQuery(sql, [id]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Purchase order not found or already processed"
        });
      }

      // Get items with total_kg
      const itemsSql = `
        SELECT 
          poi.*,
          p.name as product_name,
          p.sku,
          p.unit_type as product_unit,
          poi.total_kg
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.purchase_order_id = ?
      `;
      const items = await executeQuery(itemsSql, [id]);

      // Calculate total purchased KG
      const total_purchased_kg = items.reduce((sum, item) => 
        sum + parseFloat(item.total_kg), 0
      );

      res.json({
        success: true,
        data: {
          ...order,
          items,
          total_purchased_kg: total_purchased_kg.toFixed(3)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // PROCESS PRODUCTION - ADD STOCK
  // ============================================
  async processProduction(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { purchase_order_id, production_kg, notes } = req.body;

      // VALIDATION
      if (!purchase_order_id) throw new Error("Purchase order ID required");
      if (!production_kg || production_kg <= 0) throw new Error("Valid production KG required");

      // Get purchase order
      const [po] = await connection.query(
        `SELECT po.*, poi.product_id, poi.total_kg as purchased_kg
         FROM purchase_orders po
         JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
         WHERE po.id = ? AND po.is_production_completed = 0
         LIMIT 1`,
        [purchase_order_id]
      );

      if (!po) {
        throw new Error("Purchase order not found or already processed");
      }

      const purchased_kg = parseFloat(po.purchased_kg);
      const prod_kg = parseFloat(production_kg);

      // Validation: production should not exceed purchased
      if (prod_kg > purchased_kg) {
        throw new Error(`Production KG (${prod_kg}) cannot exceed purchased KG (${purchased_kg})`);
      }

      const wastage_kg = purchased_kg - prod_kg;
      const wastage_percentage = (wastage_kg / purchased_kg) * 100;

      // Generate production number
      const prodNumber = `PROD-${Date.now()}`;

      // Insert production record
      const [prodResult] = await connection.query(
        `INSERT INTO production_records 
        (production_number, purchase_order_id, product_id, warehouse_id,
         purchased_kg, production_kg, production_date, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
        [
          prodNumber,
          purchase_order_id,
          po.product_id,
          po.warehouse_id,
          purchased_kg,
          prod_kg,
          notes || null,
          req.user?.id
        ]
      );

      const production_id = prodResult.insertId;

      // Add production KG to stock
      await connection.query(
        `INSERT INTO stock (product_id, warehouse_id, quantity) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + ?`,
        [po.product_id, po.warehouse_id, prod_kg, prod_kg]
      );

      // Stock movement entry
      await connection.query(
        `INSERT INTO stock_movements 
        (product_id, warehouse_id, movement_type, quantity, 
         reference_type, reference_id, notes, created_by)
        VALUES (?, ?, 'production', ?, 'production_record', ?, ?, ?)`,
        [
          po.product_id,
          po.warehouse_id,
          prod_kg,
          production_id,
          `Production from ${po.po_number} - Purchased: ${purchased_kg}kg, Production: ${prod_kg}kg, Wastage: ${wastage_kg.toFixed(3)}kg`,
          req.user?.id
        ]
      );

      // Create wastage record if wastage exists
      if (wastage_kg > 0) {
        await connection.query(
          `INSERT INTO wastage_records 
          (product_id, warehouse_id, quantity, reason, description, 
           wastage_date, production_record_id, status, reported_by, approved_by)
          VALUES (?, ?, ?, 'production', ?, CURDATE(), ?, 'approved', ?, ?)`,
          [
            po.product_id,
            po.warehouse_id,
            wastage_kg,
            `Production wastage from ${po.po_number}: ${wastage_percentage.toFixed(2)}%`,
            production_id,
            req.user?.id,
            req.user?.id
          ]
        );
      }

      // Update purchase order
      await connection.query(
        `UPDATE purchase_orders 
         SET is_production_completed = 1,
             production_date = CURDATE(),
             production_kg = ?,
             wastage_kg = ?,
             wastage_percentage = ?
         WHERE id = ?`,
        [prod_kg, wastage_kg, wastage_percentage, purchase_order_id]
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: "Production processed successfully",
        data: {
          production_number: prodNumber,
          purchased_kg: purchased_kg.toFixed(3),
          production_kg: prod_kg.toFixed(3),
          wastage_kg: wastage_kg.toFixed(3),
          wastage_percentage: wastage_percentage.toFixed(2) + '%',
          stock_added: prod_kg.toFixed(3)
        }
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }

      console.error("Production processing error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to process production"
      });
    }
  }

  // ============================================
  // GET PRODUCTION HISTORY
  // ============================================
  async getProductionHistory(req, res, next) {
    try {
      const { start_date, end_date, product_id } = req.query;

      let where = '1=1';
      let params = [];

      if (start_date && end_date) {
        where += ' AND pr.production_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      if (product_id) {
        where += ' AND pr.product_id = ?';
        params.push(product_id);
      }

      const sql = `
        SELECT 
          pr.*,
          po.po_number,
          p.name as product_name,
          p.sku,
          w.name as warehouse_name,
          c.company_name as supplier_name
        FROM production_records pr
        JOIN purchase_orders po ON pr.purchase_order_id = po.id
        JOIN products p ON pr.product_id = p.id
        JOIN warehouses w ON pr.warehouse_id = w.id
        JOIN clients c ON po.supplier_id = c.id
        WHERE ${where}
        ORDER BY pr.production_date DESC, pr.created_at DESC
      `;

      const records = await executeQuery(sql, params);

      res.json({ success: true, data: records });

    } catch (error) {
      next(error);
    }
  }

  // ============================================
  // EXISTING METHODS - MODIFIED
  // ============================================
  async getOrders(req, res, next) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        status, 
        supplier_id,
        start_date,
        end_date,
        production_status // 'pending', 'completed', 'all'
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

      if (production_status === 'pending') {
        where += " AND po.is_production_completed = 0";
      } else if (production_status === 'completed') {
        where += " AND po.is_production_completed = 1";
      }

      const sql = `
        SELECT 
          po.*,
          c.company_name AS supplier_name,
          c.contact_person AS supplier_contact,
          w.name AS warehouse_name,
          CASE 
            WHEN po.is_production_completed = 1 THEN 'Completed'
            ELSE 'Pending'
          END as production_status
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

      // Get items
      const itemsSql = `
        SELECT poi.*, 
               p.name as product_name, 
               p.sku, 
               p.unit_type as product_unit,
               poi.total_kg
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.purchase_order_id = ?
      `;
      const items = await executeQuery(itemsSql, [id]);

      // Get production record if exists
      const prodSql = `
        SELECT * FROM production_records 
        WHERE purchase_order_id = ?
      `;
      const [production] = await executeQuery(prodSql, [id]);

      // Check payment
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
          production_record: production || null,
          payment_info: payment || null
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UpdatedPurchaseController();