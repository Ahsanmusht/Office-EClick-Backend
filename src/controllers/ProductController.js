const Product = require('../models/Product');

class ProductController {
  
  async getAll(req, res, next) {
    try {
      const { limit = 20, offset = 0, category_id, search, warehouse_id } = req.query;
      
      let where = 'is_active = 1';
      let params = [];
      
      if (category_id) {
        where += ' AND category_id = ?';
        params.push(category_id);
      }
      
      if (search) {
        where += ' AND (name LIKE ? OR sku LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
      }
      
      const products = warehouse_id 
        ? await Product.findAllWithStock(warehouse_id)
        : await Product.findAll({ limit, offset, where, params, orderBy: 'name ASC' });
      
      const total = await Product.count(where, params);
      
      res.json({
        success: true,
        data: { products, total, limit, offset }
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      const product = await Product.findWithCategory(id);
      
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const product = await Product.create(req.body);
      res.status(201).json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const product = await Product.update(id, req.body);
      
      if (!product) {
        return res.status(404).json({ success: false, error: 'Product not found' });
      }
      
      res.json({ success: true, data: product });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      // Soft delete
      await Product.update(id, { is_active: 0 });
      res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  async getLowStock(req, res, next) {
    try {
      const { warehouse_id } = req.query;
      const products = await Product.getLowStockProducts(warehouse_id);
      res.json({ success: true, data: products });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProductController();