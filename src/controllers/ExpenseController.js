const BaseModel = require('../models/BaseModel');
const { executeQuery } = require('../config/database');

const Expense = new BaseModel('expenses');
const ExpenseCategory = new BaseModel('expense_categories');

class ExpenseController {
  
  // ==================== EXPENSES ====================
  
  async create(req, res, next) {
    try {
      const { category_id, amount, payment_method, expense_date, ...expenseData } = req.body;
      
      // Generate expense number
      const expenseNumber = `EXP-${Date.now()}`;
      
      const expense = await Expense.create({
        expense_number: expenseNumber,
        category_id,
        expense_date: expense_date || new Date().toISOString().split('T')[0],
        amount,
        payment_method,
        vendor_name: expenseData.vendor_name,
        description: expenseData.description,
        receipt_url: expenseData.receipt_url,
        is_recurring: expenseData.is_recurring || 0,
        recurring_frequency: expenseData.recurring_frequency,
        warehouse_id: expenseData.warehouse_id,
        created_by: req.user?.id
      });
      
      res.status(201).json({ success: true, data: expense });
      
    } catch (error) {
      next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const { 
        limit = 20, 
        offset = 0, 
        category_id, 
        start_date, 
        end_date,
        warehouse_id,
        payment_method 
      } = req.query;
      
      let where = '1=1';
      let params = [];
      
      if (category_id) {
        where += ' AND category_id = ?';
        params.push(category_id);
      }
      
      if (start_date && end_date) {
        where += ' AND expense_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      if (warehouse_id) {
        where += ' AND warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      if (payment_method) {
        where += ' AND payment_method = ?';
        params.push(payment_method);
      }
      
      const expenses = await Expense.findAll({ 
        limit, 
        offset, 
        where, 
        params,
        orderBy: 'expense_date DESC'
      });
      
      const total = await Expense.count(where, params);
      
      res.json({ success: true, data: { expenses, total } });
      
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;
      
      const sql = `
        SELECT e.*, ec.name as category_name, w.name as warehouse_name,
               u.full_name as created_by_name
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN warehouses w ON e.warehouse_id = w.id
        LEFT JOIN users u ON e.created_by = u.id
        WHERE e.id = ?
      `;
      
      const [expense] = await executeQuery(sql, [id]);
      
      if (!expense) {
        return res.status(404).json({ 
          success: false, 
          error: 'Expense not found' 
        });
      }
      
      res.json({ success: true, data: expense });
      
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const expense = await Expense.update(id, req.body);
      
      if (!expense) {
        return res.status(404).json({ 
          success: false, 
          error: 'Expense not found' 
        });
      }
      
      res.json({ success: true, data: expense });
      
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await Expense.delete(id);
      
      if (!deleted) {
        return res.status(404).json({ 
          success: false, 
          error: 'Expense not found' 
        });
      }
      
      res.json({ success: true, message: 'Expense deleted successfully' });
      
    } catch (error) {
      next(error);
    }
  }

  // ==================== EXPENSE CATEGORIES ====================
  
  async getCategories(req, res, next) {
    try {
      const categories = await ExpenseCategory.findAll({ 
        where: 'is_active = 1',
        orderBy: 'name ASC'
      });
      
      res.json({ success: true, data: categories });
      
    } catch (error) {
      next(error);
    }
  }

  async createCategory(req, res, next) {
    try {
      const category = await ExpenseCategory.create(req.body);
      res.status(201).json({ success: true, data: category });
      
    } catch (error) {
      next(error);
    }
  }

  // ==================== REPORTS ====================
  
  async getExpenseReport(req, res, next) {
    try {
      const { start_date, end_date, category_id, warehouse_id } = req.query;
      
      let sql = `
        SELECT 
          e.*,
          ec.name as category_name,
          w.name as warehouse_name
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        LEFT JOIN warehouses w ON e.warehouse_id = w.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (start_date && end_date) {
        sql += ' AND e.expense_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }
      
      if (category_id) {
        sql += ' AND e.category_id = ?';
        params.push(category_id);
      }
      
      if (warehouse_id) {
        sql += ' AND e.warehouse_id = ?';
        params.push(warehouse_id);
      }
      
      sql += ' ORDER BY e.expense_date DESC';
      
      const expenses = await executeQuery(sql, params);
      
      // Calculate summary
      const total_amount = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      
      // Group by category
      const by_category = {};
      expenses.forEach(e => {
        const cat = e.category_name || 'Uncategorized';
        if (!by_category[cat]) {
          by_category[cat] = { count: 0, total: 0 };
        }
        by_category[cat].count++;
        by_category[cat].total += parseFloat(e.amount);
      });
      
      // Group by payment method
      const by_payment_method = {};
      expenses.forEach(e => {
        if (!by_payment_method[e.payment_method]) {
          by_payment_method[e.payment_method] = { count: 0, total: 0 };
        }
        by_payment_method[e.payment_method].count++;
        by_payment_method[e.payment_method].total += parseFloat(e.amount);
      });
      
      res.json({
        success: true,
        data: {
          expenses,
          summary: {
            total_amount,
            count: expenses.length,
            by_category,
            by_payment_method
          }
        }
      });
      
    } catch (error) {
      next(error);
    }
  }

  async getMonthlyExpenses(req, res, next) {
    try {
      const { year = new Date().getFullYear() } = req.query;
      
      const sql = `
        SELECT 
          MONTH(expense_date) as month,
          MONTHNAME(expense_date) as month_name,
          COUNT(*) as count,
          SUM(amount) as total
        FROM expenses
        WHERE YEAR(expense_date) = ?
        GROUP BY MONTH(expense_date), MONTHNAME(expense_date)
        ORDER BY MONTH(expense_date)
      `;
      
      const monthly = await executeQuery(sql, [year]);
      
      res.json({ success: true, data: monthly });
      
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ExpenseController();