const BaseModel = require("../models/BaseModel");
const { executeQuery, executeTransaction } = require("../config/database");

const PurchaseRequisition = new BaseModel("purchase_requisitions");
const PurchaseRequisitionItem = new BaseModel("purchase_requisition_items");
const SupplierRating = new BaseModel("supplier_ratings");

class SupplyChainController {
  // ==================== PURCHASE REQUISITIONS ====================

  async createRequisition(req, res, next) {
    try {
      const { warehouse_id, required_date, items, notes } = req.body;

      // Generate requisition number
      const reqNumber = `PR-${Date.now()}`;

      // Create requisition
      const queries = [
        {
          sql: `INSERT INTO purchase_requisitions 
              (requisition_number, requested_by, warehouse_id, request_date, 
               required_date, status, notes)
              VALUES (?, ?, ?, CURDATE(), ?, 'pending', ?)`,
          params: [reqNumber, req.user?.id, warehouse_id, required_date, notes],
        },
      ];

      const [result] = await executeTransaction(queries);
      const requisitionId = result.insertId;

      // Add items with current stock levels
      const itemQueries = [];
      for (const item of items) {
        // Get current stock
        const stockSql = `SELECT COALESCE(SUM(quantity), 0) as current_stock 
                         FROM stock WHERE product_id = ? AND warehouse_id = ?`;
        const [stockData] = await executeQuery(stockSql, [
          item.product_id,
          warehouse_id,
        ]);

        itemQueries.push({
          sql: `INSERT INTO purchase_requisition_items 
                (requisition_id, product_id, quantity, current_stock, estimated_price, notes)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [
            requisitionId,
            item.product_id,
            item.quantity,
            stockData.current_stock,
            item.estimated_price || null,
            item.notes || null,
          ],
        });
      }

      await executeTransaction(itemQueries);

      const requisition = await PurchaseRequisition.findById(requisitionId);
      res.status(201).json({ success: true, data: requisition });
    } catch (error) {
      next(error);
    }
  }

  async getRequisitions(req, res, next) {
    try {
      const { limit = 20, offset = 0, status, warehouse_id } = req.query;

      let where = "1=1";
      let params = [];

      if (status) {
        where += " AND status = ?";
        params.push(status);
      }

      if (warehouse_id) {
        where += " AND warehouse_id = ?";
        params.push(warehouse_id);
      }

      const requisitions = await PurchaseRequisition.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "request_date DESC",
      });

      const total = await PurchaseRequisition.count(where, params);

      res.json({ success: true, data: { requisitions, total } });
    } catch (error) {
      next(error);
    }
  }

  async getRequisitionById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `
        SELECT pr.*, 
               u.full_name as requested_by_name,
               w.name as warehouse_name,
               approver.full_name as approved_by_name
        FROM purchase_requisitions pr
        LEFT JOIN users u ON pr.requested_by = u.id
        LEFT JOIN warehouses w ON pr.warehouse_id = w.id
        LEFT JOIN users approver ON pr.approved_by = approver.id
        WHERE pr.id = ?
      `;

      const [requisition] = await executeQuery(sql, [id]);

      if (!requisition) {
        return res.status(404).json({
          success: false,
          error: "Requisition not found",
        });
      }

      // Get items
      const itemsSql = `
        SELECT pri.*, p.name as product_name, p.sku, p.unit_type
        FROM purchase_requisition_items pri
        JOIN products p ON pri.product_id = p.id
        WHERE pri.requisition_id = ?
      `;
      const items = await executeQuery(itemsSql, [id]);

      res.json({ success: true, data: { ...requisition, items } });
    } catch (error) {
      next(error);
    }
  }

  async approveRequisition(req, res, next) {
    try {
      const { id } = req.params;

      const requisition = await PurchaseRequisition.findById(id);

      if (!requisition) {
        return res.status(404).json({
          success: false,
          error: "Requisition not found",
        });
      }

      if (requisition.status !== "pending") {
        return res.status(400).json({
          success: false,
          error: "Only pending requisitions can be approved",
        });
      }

      await PurchaseRequisition.update(id, {
        status: "approved",
        approved_by: req.user?.id,
        approval_date: new Date().toISOString().split("T")[0],
      });

      res.json({ success: true, message: "Requisition approved successfully" });
    } catch (error) {
      next(error);
    }
  }

  async rejectRequisition(req, res, next) {
    try {
      const { id } = req.params;
      const { rejection_reason } = req.body;

      await PurchaseRequisition.update(id, {
        status: "rejected",
        approved_by: req.user?.id,
        approval_date: new Date().toISOString().split("T")[0],
        notes: rejection_reason,
      });

      res.json({ success: true, message: "Requisition rejected" });
    } catch (error) {
      next(error);
    }
  }

  async convertToPurchaseOrder(req, res, next) {
    try {
      const { id } = req.params;
      const { supplier_id } = req.body;

      const requisition = await PurchaseRequisition.findById(id);

      if (!requisition) {
        return res.status(404).json({
          success: false,
          error: "Requisition not found",
        });
      }

      if (requisition.status !== "approved") {
        return res.status(400).json({
          success: false,
          error: "Only approved requisitions can be converted",
        });
      }

      // Get requisition items
      const itemsSql = `SELECT * FROM purchase_requisition_items WHERE requisition_id = ?`;
      const items = await executeQuery(itemsSql, [id]);

      // Create purchase order
      const poNumber = `PO-${Date.now()}`;

      // Calculate totals
      let subtotal = 0;
      items.forEach((item) => {
        subtotal +=
          parseFloat(item.quantity) * parseFloat(item.estimated_price || 0);
      });

      const poQueries = [
        {
          sql: `INSERT INTO purchase_orders 
              (po_number, supplier_id, warehouse_id, order_date, expected_delivery_date,
               subtotal, total_amount, status, notes, created_by)
              VALUES (?, ?, ?, CURDATE(), ?, ?, ?, 'draft', ?, ?)`,
          params: [
            poNumber,
            supplier_id,
            requisition.warehouse_id,
            requisition.required_date,
            subtotal,
            subtotal,
            `Converted from Requisition ${requisition.requisition_number}`,
            req.user?.id,
          ],
        },
      ];

      const [poResult] = await executeTransaction(poQueries);
      const poId = poResult.insertId;

      // Add items to PO
      const poItemQueries = items.map((item) => ({
        sql: `INSERT INTO purchase_order_items 
              (purchase_order_id, product_id, quantity, unit_price)
              VALUES (?, ?, ?, ?)`,
        params: [
          poId,
          item.product_id,
          item.quantity,
          item.estimated_price || 0,
        ],
      }));

      await executeTransaction(poItemQueries);

      // Update requisition status
      await PurchaseRequisition.update(id, { status: "converted" });

      res.json({
        success: true,
        message: "Purchase order created successfully",
        data: { purchase_order_id: poId, po_number: poNumber },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== SUPPLIER RATINGS ====================

  async rateSupplier(req, res, next) {
    try {
      const {
        supplier_id,
        purchase_order_id,
        quality_rating,
        delivery_rating,
        service_rating,
        comments,
      } = req.body;

      const rating = await SupplierRating.create({
        supplier_id,
        purchase_order_id,
        quality_rating,
        delivery_rating,
        service_rating,
        comments,
        rated_by: req.user?.id,
        rating_date: new Date().toISOString().split("T")[0],
      });

      res.status(201).json({ success: true, data: rating });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierRatings(req, res, next) {
    try {
      const { supplier_id } = req.query;

      let where = "1=1";
      let params = [];

      if (supplier_id) {
        where += " AND supplier_id = ?";
        params.push(supplier_id);
      }

      const ratings = await SupplierRating.findAll({
        where,
        params,
        orderBy: "rating_date DESC",
      });

      res.json({ success: true, data: ratings });
    } catch (error) {
      next(error);
    }
  }

  async getSupplierPerformance(req, res, next) {
    try {
      const { supplier_id } = req.params;

      // Overall ratings
      const ratingSql = `
        SELECT 
          AVG(quality_rating) as avg_quality,
          AVG(delivery_rating) as avg_delivery,
          AVG(service_rating) as avg_service,
          AVG(overall_rating) as avg_overall,
          COUNT(*) as total_ratings
        FROM supplier_ratings
        WHERE supplier_id = ?
      `;
      const [ratings] = await executeQuery(ratingSql, [supplier_id]);

      // Purchase history
      const purchaseSql = `
        SELECT 
          COUNT(*) as total_orders,
          SUM(total_amount) as total_value,
          AVG(total_amount) as avg_order_value,
          SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders
        FROM purchase_orders
        WHERE supplier_id = ?
      `;
      const [purchases] = await executeQuery(purchaseSql, [supplier_id]);

      // Delivery performance
      const deliverySql = `
        SELECT 
          AVG(DATEDIFF(
            CASE WHEN status = 'received' THEN updated_at ELSE NULL END,
            expected_delivery_date
          )) as avg_delivery_delay_days
        FROM purchase_orders
        WHERE supplier_id = ? AND status = 'received'
      `;
      const [delivery] = await executeQuery(deliverySql, [supplier_id]);

      res.json({
        success: true,
        data: {
          ratings: {
            quality: parseFloat(ratings.avg_quality || 0).toFixed(2),
            delivery: parseFloat(ratings.avg_delivery || 0).toFixed(2),
            service: parseFloat(ratings.avg_service || 0).toFixed(2),
            overall: parseFloat(ratings.avg_overall || 0).toFixed(2),
            total_ratings: ratings.total_ratings,
          },
          purchases: {
            ...purchases,
            fulfillment_rate:
              purchases.total_orders > 0
                ? (
                    (purchases.completed_orders / purchases.total_orders) *
                    100
                  ).toFixed(2)
                : 0,
          },
          delivery_performance: {
            avg_delay_days: parseFloat(
              delivery.avg_delivery_delay_days || 0
            ).toFixed(1),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getTopSuppliers(req, res, next) {
    try {
      const { limit = 10 } = req.query;

      const sql = `
        SELECT 
          c.id,
          c.company_name,
          c.client_code,
          COUNT(DISTINCT po.id) as total_orders,
          SUM(po.total_amount) as total_value,
          AVG(sr.overall_rating) as avg_rating,
          MAX(po.order_date) as last_order_date
        FROM clients c
        LEFT JOIN purchase_orders po ON c.id = po.supplier_id
        LEFT JOIN supplier_ratings sr ON c.id = sr.supplier_id
        WHERE c.client_type IN ('supplier', 'both')
        GROUP BY c.id, c.company_name, c.client_code
        HAVING total_orders > 0
        ORDER BY avg_rating DESC, total_value DESC
        LIMIT ?
      `;

      const suppliers = await executeQuery(sql, [parseInt(limit)]);

      res.json({ success: true, data: suppliers });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PROCUREMENT ANALYTICS ====================

  async getProcurementAnalytics(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      const dateFilter =
        start_date && end_date
          ? `BETWEEN '${start_date}' AND '${end_date}'`
          : `>= DATE_SUB(CURDATE(), INTERVAL 90 DAY)`;

      // Purchase trends
      const trendSql = `
        SELECT 
          DATE_FORMAT(order_date, '%Y-%m') as month,
          COUNT(*) as order_count,
          SUM(total_amount) as total_value,
          AVG(total_amount) as avg_order_value
        FROM purchase_orders
        WHERE order_date ${dateFilter}
        GROUP BY DATE_FORMAT(order_date, '%Y-%m')
        ORDER BY month DESC
      `;
      const trends = await executeQuery(trendSql);

      // Category-wise spending
      const categorySql = `
        SELECT 
          pc.name as category,
          COUNT(DISTINCT po.id) as order_count,
          SUM(poi.total_price) as total_spent
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        JOIN product_categories pc ON p.category_id = pc.id
        JOIN purchase_orders po ON poi.purchase_order_id = po.id
        WHERE po.order_date ${dateFilter}
        GROUP BY pc.id, pc.name
        ORDER BY total_spent DESC
      `;
      const categories = await executeQuery(categorySql);

      // Lead time analysis
      const leadTimeSql = `
        SELECT 
          AVG(DATEDIFF(updated_at, order_date)) as avg_lead_time_days,
          MIN(DATEDIFF(updated_at, order_date)) as min_lead_time,
          MAX(DATEDIFF(updated_at, order_date)) as max_lead_time
        FROM purchase_orders
        WHERE status = 'received' AND order_date ${dateFilter}
      `;
      const [leadTime] = await executeQuery(leadTimeSql);

      res.json({
        success: true,
        data: {
          trends,
          category_spending: categories,
          lead_time: leadTime,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SupplyChainController();
