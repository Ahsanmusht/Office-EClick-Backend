const Stock = require('../models/Stock');

class StockController {
  
  async getStock(req, res, next) {
    try {
      const { product_id, warehouse_id } = req.query;
      
      if (!product_id || !warehouse_id) {
        return res.status(400).json({ 
          success: false, 
          error: 'product_id and warehouse_id are required' 
        });
      }
      
      const stock = await Stock.getStock(product_id, warehouse_id);
      res.json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  }

  async adjustStock(req, res, next) {
    try {
      const { product_id, warehouse_id, quantity, notes } = req.body;
      
      const stock = await Stock.updateStock(
        product_id,
        warehouse_id,
        quantity,
        'adjustment',
        { notes, created_by: req.user?.id }
      );
      
      res.json({ success: true, data: stock });
    } catch (error) {
      next(error);
    }
  }

  async transferStock(req, res, next) {
    try {
      const { product_id, from_warehouse_id, to_warehouse_id, quantity, notes } = req.body;
      
      await Stock.transferStock(
        product_id,
        from_warehouse_id,
        to_warehouse_id,
        quantity,
        notes
      );
      
      res.json({ success: true, message: 'Stock transferred successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getHistory(req, res, next) {
    try {
      const { product_id, warehouse_id, limit = 50 } = req.query;
      
      const history = await Stock.getStockHistory(product_id, warehouse_id, limit);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new StockController();