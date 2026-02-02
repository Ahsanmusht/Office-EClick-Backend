const { executeQuery } = require("../config/database");
const dayjs = require("dayjs");

class PrintController {
  // ==================== SALES ORDER SLIP ====================
  async getSalesOrderSlip(req, res, next) {
    try {
      const { id } = req.params;

      // Get order details
      const orderSql = `
        SELECT 
          so.*,
          c.company_name,
          c.contact_person,
          c.phone,
          c.email,
          c.address,
          c.balance as customer_balance,
          w.name as warehouse_name,
          u.full_name as created_by_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.customer_id = c.id
        LEFT JOIN warehouses w ON so.warehouse_id = w.id
        LEFT JOIN users u ON so.created_by = u.id
        WHERE so.id = ?
      `;
      const [order] = await executeQuery(orderSql, [id]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Sales order not found",
        });
      }

      // Get order items with details
      const itemsSql = `
        SELECT 
          soi.*,
          p.name as product_name,
          p.sku,
          soi.total_kg,
          (soi.total_kg * soi.unit_price) as item_subtotal,
          ((soi.total_kg * soi.unit_price) * (soi.discount_rate / 100)) as item_discount,
          (((soi.total_kg * soi.unit_price) - ((soi.total_kg * soi.unit_price) * (soi.discount_rate / 100))) * (soi.tax_rate / 100)) as item_tax
        FROM sales_order_items soi
        JOIN products p ON soi.product_id = p.id
        WHERE soi.sales_order_id = ?
        ORDER BY soi.id
      `;
      const items = await executeQuery(itemsSql, [id]);

      // Get payment info
      const paymentSql = `
        SELECT * FROM petty_cash
        WHERE reference_type = 'sales_order' AND reference_id = ?
        ORDER BY transaction_date DESC
        LIMIT 1
      `;
      const [payment] = await executeQuery(paymentSql, [id]);

      // Calculate totals
      let subtotal = 0;
      let total_discount = 0;
      let total_tax = 0;

      items.forEach((item) => {
        subtotal += parseFloat(item.item_subtotal);
        total_discount += parseFloat(item.item_discount);
        total_tax += parseFloat(item.item_tax);
      });

      const final_total =
        subtotal -
        total_discount +
        total_tax +
        parseFloat(order.shipping_charges || 0);

      res.json({
        success: true,
        data: {
          order_info: {
            order_number: order.order_number,
            order_date: dayjs(order.order_date).format("DD/MM/YYYY"),
            delivery_date: order.delivery_date
              ? dayjs(order.delivery_date).format("DD/MM/YYYY")
              : null,
            status: order.status,
            created_by: order.created_by_name,
            notes: order.notes,
          },
          customer_info: {
            name: order.company_name,
            contact_person: order.contact_person,
            phone: order.phone,
            email: order.email,
            address: order.address,
            current_balance: parseFloat(order.customer_balance).toFixed(2),
          },
          warehouse_info: {
            name: order.warehouse_name,
            address: order.warehouse_address,
          },
          items: items.map((item) => ({
            product_name: item.product_name,
            sku: item.sku,
            unit_type: item.unit_type,
            bag_weight: item.bag_weight,
            quantity: parseFloat(item.quantity).toFixed(3),
            total_kg: parseFloat(item.total_kg).toFixed(3),
            unit_price: parseFloat(item.unit_price).toFixed(2),
            tax_rate: parseFloat(item.tax_rate).toFixed(2),
            discount_rate: parseFloat(item.discount_rate).toFixed(2),
            subtotal: parseFloat(item.item_subtotal).toFixed(2),
            discount: parseFloat(item.item_discount).toFixed(2),
            tax: parseFloat(item.item_tax).toFixed(2),
            total: (
              parseFloat(item.item_subtotal) -
              parseFloat(item.item_discount) +
              parseFloat(item.item_tax)
            ).toFixed(2),
          })),
          totals: {
            subtotal: subtotal.toFixed(2),
            discount: total_discount.toFixed(2),
            tax: total_tax.toFixed(2),
            shipping: parseFloat(order.shipping_charges || 0).toFixed(2),
            grand_total: final_total.toFixed(2),
          },
          payment: payment
            ? {
                paid: true,
                amount: parseFloat(payment.amount).toFixed(2),
                payment_method: payment.payment_method,
                payment_date: dayjs(payment.transaction_date).format(
                  "DD/MM/YYYY",
                ),
                transaction_number: payment.transaction_number,
              }
            : {
                paid: false,
                amount: "0.00",
              },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PURCHASE ORDER SLIP ====================
  async getPurchaseOrderSlip(req, res, next) {
    try {
      const { id } = req.params;

      // Get order details
      const orderSql = `
        SELECT 
          po.*,
          c.company_name,
          c.contact_person,
          c.phone,
          c.email,
          c.address,
          c.balance as supplier_balance,
          w.name as warehouse_name,
          u.full_name as created_by_name
        FROM purchase_orders po
        LEFT JOIN clients c ON po.supplier_id = c.id
        LEFT JOIN warehouses w ON po.warehouse_id = w.id
        LEFT JOIN users u ON po.created_by = u.id
        WHERE po.id = ?
      `;
      const [order] = await executeQuery(orderSql, [id]);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: "Purchase order not found",
        });
      }

      // Get order items
      const itemsSql = `
        SELECT 
          poi.*,
          p.name as product_name,
          p.sku,
          poi.total_kg,
          (poi.total_kg * poi.unit_price) as item_subtotal,
          ((poi.total_kg * poi.unit_price) * (poi.discount_rate / 100)) as item_discount,
          (((poi.total_kg * poi.unit_price) - ((poi.total_kg * poi.unit_price) * (poi.discount_rate / 100))) * (poi.tax_rate / 100)) as item_tax
        FROM purchase_order_items poi
        JOIN products p ON poi.product_id = p.id
        WHERE poi.purchase_order_id = ?
        ORDER BY poi.id
      `;
      const items = await executeQuery(itemsSql, [id]);

      // Get payment info
      const paymentSql = `
        SELECT * FROM petty_cash
        WHERE reference_type = 'purchase_order' AND reference_id = ?
        ORDER BY transaction_date DESC
        LIMIT 1
      `;
      const [payment] = await executeQuery(paymentSql, [id]);

      // Get production records
      const productionSql = `
        SELECT 
          pr.*,
          p.name as product_name
        FROM production_records pr
        JOIN products p ON pr.product_id = p.id
        WHERE pr.purchase_order_id = ?
      `;
      const production_records = await executeQuery(productionSql, [id]);

      // Calculate totals
      let subtotal = 0;
      let total_discount = 0;
      let total_tax = 0;

      items.forEach((item) => {
        subtotal += parseFloat(item.item_subtotal);
        total_discount += parseFloat(item.item_discount);
        total_tax += parseFloat(item.item_tax);
      });

      const final_total = subtotal - total_discount + total_tax;

      res.json({
        success: true,
        data: {
          order_info: {
            po_number: order.po_number,
            order_date: dayjs(order.order_date).format("DD/MM/YYYY"),
            expected_delivery: order.expected_delivery_date
              ? dayjs(order.expected_delivery_date).format("DD/MM/YYYY")
              : null,
            production_date: order.production_date
              ? dayjs(order.production_date).format("DD/MM/YYYY")
              : null,
            status: order.status,
            production_status: order.is_production_completed
              ? "Completed"
              : "Pending",
            created_by: order.created_by_name,
            notes: order.notes,
          },
          supplier_info: {
            name: order.company_name,
            contact_person: order.contact_person,
            phone: order.phone,
            email: order.email,
            address: order.address,
            current_balance: parseFloat(order.supplier_balance).toFixed(2),
          },
          warehouse_info: {
            name: order.warehouse_name,
            address: order.warehouse_address,
          },
          items: items.map((item) => ({
            product_name: item.product_name,
            sku: item.sku,
            unit_type: item.unit_type,
            bag_weight: item.bag_weight,
            quantity: parseFloat(item.quantity).toFixed(3),
            total_kg: parseFloat(item.total_kg).toFixed(3),
            unit_price: parseFloat(item.unit_price).toFixed(2),
            tax_rate: parseFloat(item.tax_rate).toFixed(2),
            discount_rate: parseFloat(item.discount_rate).toFixed(2),
            subtotal: parseFloat(item.item_subtotal).toFixed(2),
            discount: parseFloat(item.item_discount).toFixed(2),
            tax: parseFloat(item.item_tax).toFixed(2),
            total: (
              parseFloat(item.item_subtotal) -
              parseFloat(item.item_discount) +
              parseFloat(item.item_tax)
            ).toFixed(2),
            production_completed: item.is_production_completed === 1,
          })),
          production_details: production_records.map((pr) => ({
            product_name: pr.product_name,
            production_number: pr.production_number,
            purchased_kg: parseFloat(pr.purchased_kg).toFixed(3),
            production_kg: parseFloat(pr.production_kg).toFixed(3),
            wastage_kg: parseFloat(pr.wastage_kg).toFixed(3),
            wastage_percentage: parseFloat(pr.wastage_percentage).toFixed(2),
          })),
          totals: {
            subtotal: subtotal.toFixed(2),
            discount: total_discount.toFixed(2),
            tax: total_tax.toFixed(2),
            grand_total: final_total.toFixed(2),
          },
          payment: payment
            ? {
                paid: true,
                amount: parseFloat(payment.amount).toFixed(2),
                payment_method: payment.payment_method,
                payment_date: dayjs(payment.transaction_date).format(
                  "DD/MM/YYYY",
                ),
                transaction_number: payment.transaction_number,
              }
            : {
                paid: false,
                amount: "0.00",
              },
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PrintController();
