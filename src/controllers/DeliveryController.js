const BaseModel = require('../models/BaseModel');
const { executeQuery } = require('../config/database');

const Delivery = new BaseModel('deliveries');

class DeliveryController {
  
  async createDelivery(req, res, next) {
    try {
      const { 
        sales_order_id, 
        delivery_date, 
        delivery_time,
        driver_name,
        vehicle_number,
        delivery_address,
        recipient_name,
        recipient_phone,
        notes 
      } = req.body;
      
      // Check if sales order exists
      const orderSql = `SELECT * FROM sales_orders WHERE id = ?`;
      const [order] = await executeQuery(orderSql, [sales_order_id]);
      
      if (!order) {
        return res.status(404).json({ 
          success: false, 
          error: 'Sales order not found' 
        });
      }
      
      // Generate delivery number
      const deliveryNumber = `DEL-${Date.now()}`;
      
      const delivery = await Delivery.create({
        delivery_number: deliveryNumber,
        sales_order_id,
        delivery_date: delivery_date || new Date().toISOString().split('T')[0],
        delivery_time,
        driver_name,
        vehicle_number,
        status: 'scheduled',
        delivery_address,
        recipient_name,
        recipient_phone,
        notes
      });
      
      res.status(201).json({ success: true, data: delivery });
      
    } catch (error) {
      next(error);
    }
  }

  async updateDeliveryStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, proof_of_delivery, notes } = req.body;
      
      const updateData = { status };
      
      if (proof_of_delivery) {
        updateData.proof_of_delivery = proof_of_delivery;
      }
      
      if (notes) {
        updateData.notes = notes;
      }
      
      const delivery = await Delivery.update(id, updateData);
      
      if (!delivery) {
        return res.status(404).json({ 
          success: false, 
          error: 'Delivery not found' 
        });
      }
      
      // If delivered, update sales order status
      if (status === 'delivered') {
        await executeQuery(
          'UPDATE sales_orders SET status = "delivered" WHERE id = ?',
          [delivery.sales_order_id]
        );
      }
      
      res.json({ success: true, data: delivery });
      
    } catch (error) {
      next(error);
    }
  }

  async getDeliveries(req, res, next) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        status, 
        delivery_date,
        driver_name 
      } = req.query;
      
      let where = '1=1';
      let params = [];
      
      if (status) {
        where += ' AND status = ?';
        params.push(status);
      }
      
      if (delivery_date) {
        where += ' AND delivery_date = ?';
        params.push(delivery_date);
      }
      
      if (driver_name) {
        where += ' AND driver_name LIKE ?';
        params.push(`%${driver_name}%`);
      }
      
      const deliveries = await Delivery.findAll({ 
        limit, 
        offset, 
        where, 
        params,
        orderBy: 'delivery_date DESC, delivery_time DESC'
      });
      
      const total = await Delivery.count(where, params);
      
      res.json({ success: true, data: { deliveries, total } });
      
    } catch (error) {
      next(error);
    }
  }

  async getDeliveryById(req, res, next) {
    try {
      const { id } = req.params;
      
      const sql = `
        SELECT d.*, 
               so.order_number,
               so.total_amount as order_amount,
               c.company_name as customer_name,
               c.phone as customer_phone,
               c.email as customer_email
        FROM deliveries d
        LEFT JOIN sales_orders so ON d.sales_order_id = so.id
        LEFT JOIN clients c ON so.customer_id = c.id
        WHERE d.id = ?
      `;
      
      const [delivery] = await executeQuery(sql, [id]);
      
      if (!delivery) {
        return res.status(404).json({ 
          success: false, 
          error: 'Delivery not found' 
        });
      }
      
      // Get order items
      const itemsSql = `
        SELECT soi.*, p.name as product_name, p.sku
        FROM sales_order_items soi
        LEFT JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
      `;
      const items = await executeQuery(itemsSql, [delivery.sales_order_id]);
      
      res.json({ success: true, data: { ...delivery, items } });
      
    } catch (error) {
      next(error);
    }
  }

  async getTodayDeliveries(req, res, next) {
    try {
      const sql = `
        SELECT d.*, 
               so.order_number,
               c.company_name as customer_name,
               c.phone as customer_phone
        FROM deliveries d
        LEFT JOIN sales_orders so ON d.sales_order_id = so.id
        LEFT JOIN clients c ON so.customer_id = c.id
        WHERE d.delivery_date = CURDATE()
        AND d.status IN ('scheduled', 'in_transit')
        ORDER BY d.delivery_time ASC
      `;
      
      const deliveries = await executeQuery(sql);
      
      res.json({ success: true, data: deliveries });
      
    } catch (error) {
      next(error);
    }
  }

  async getDeliveriesByDriver(req, res, next) {
    try {
      const { driver_name } = req.params;
      const { status } = req.query;
      
      let sql = `
        SELECT d.*, 
               so.order_number,
               c.company_name as customer_name
        FROM deliveries d
        LEFT JOIN sales_orders so ON d.sales_order_id = so.id
        LEFT JOIN clients c ON so.customer_id = c.id
        WHERE d.driver_name = ?
      `;
      
      const params = [driver_name];
      
      if (status) {
        sql += ' AND d.status = ?';
        params.push(status);
      }
      
      sql += ' ORDER BY d.delivery_date DESC, d.delivery_time DESC';
      
      const deliveries = await executeQuery(sql, params);
      
      res.json({ success: true, data: deliveries });
      
    } catch (error) {
      next(error);
    }
  }

  async getDeliveryReport(req, res, next) {
    try {
      const { start_date, end_date, status } = req.query;
      
      let sql = `
        SELECT 
          DATE(d.delivery_date) as date,
          COUNT(*) as total_deliveries,
          SUM(CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN d.status = 'returned' THEN 1 ELSE 0 END) as returned
        FROM deliveries d
        WHERE 1=1
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND d.delivery_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      sql += ' GROUP BY DATE(d.delivery_date) ORDER BY date DESC';
      
      const report = await executeQuery(sql, params);
      
      // Driver performance
      const driverSql = `
        SELECT 
          driver_name,
          COUNT(*) as total_deliveries,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as successful,
          ROUND(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
        FROM deliveries
        WHERE delivery_date BETWEEN ? AND ?
        GROUP BY driver_name
        ORDER BY success_rate DESC
      `;
      
      const driverPerformance = await executeQuery(
        driverSql, 
        [start_date || '2020-01-01', end_date || '2099-12-31']
      );
      
      res.json({ 
        success: true, 
        data: { 
          daily_report: report,
          driver_performance: driverPerformance 
        } 
      });
      
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DeliveryController();