const BaseModel = require("../models/BaseModel");
const { executeQuery, getConnection } = require("../config/database");

const BankAccount = new BaseModel("bank_accounts");

class BankAccountController {
  
  async getAll(req, res, next) {
    try {
      const { limit = 100, offset = 0, is_active } = req.query;

      let where = "1=1";
      let params = [];

      if (is_active !== undefined) {
        where += " AND is_active = ?";
        params.push(is_active);
      }

      const sql = `
        SELECT * FROM bank_accounts
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `;

      const accounts = await executeQuery(sql, [...params, parseInt(limit), parseInt(offset)]);
      
      const countSql = `SELECT COUNT(*) as total FROM bank_accounts WHERE ${where}`;
      const [{ total }] = await executeQuery(countSql, params);

      res.json({
        success: true,
        data: {
          accounts,
          total,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });

    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const sql = `SELECT * FROM bank_accounts WHERE id = ?`;
      const [account] = await executeQuery(sql, [id]);

      if (!account) {
        return res.status(404).json({
          success: false,
          error: 'Bank account not found'
        });
      }

      res.json({ success: true, data: account });

    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const {
        account_name,
        bank_name,
        account_number,
        branch,
        iban,
        swift_code,
        opening_balance = 0
      } = req.body;

      if (!account_name || !bank_name || !account_number) {
        throw new Error('Account name, bank name, and account number are required');
      }

      const [result] = await connection.query(
        `INSERT INTO bank_accounts 
        (account_name, bank_name, account_number, branch, iban, swift_code, 
         opening_balance, current_balance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          account_name,
          bank_name,
          account_number,
          branch || null,
          iban || null,
          swift_code || null,
          opening_balance,
          opening_balance
        ]
      );

      await connection.commit();
      
      const [newAccount] = await connection.query(
        'SELECT * FROM bank_accounts WHERE id = ?',
        [result.insertId]
      );

      connection.release();

      res.status(201).json({
        success: true,
        message: 'Bank account created successfully',
        data: newAccount[0]
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Bank account creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create bank account'
      });
    }
  }

  async update(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { id } = req.params;
      const {
        account_name,
        bank_name,
        account_number,
        branch,
        iban,
        swift_code,
        is_active
      } = req.body;

      const [existing] = await connection.query(
        'SELECT * FROM bank_accounts WHERE id = ?',
        [id]
      );

      if (!existing || existing.length === 0) {
        throw new Error('Bank account not found');
      }

      await connection.query(
        `UPDATE bank_accounts 
         SET account_name = ?, bank_name = ?, account_number = ?,
             branch = ?, iban = ?, swift_code = ?, is_active = ?
         WHERE id = ?`,
        [
          account_name || existing[0].account_name,
          bank_name || existing[0].bank_name,
          account_number || existing[0].account_number,
          branch !== undefined ? branch : existing[0].branch,
          iban !== undefined ? iban : existing[0].iban,
          swift_code !== undefined ? swift_code : existing[0].swift_code,
          is_active !== undefined ? is_active : existing[0].is_active,
          id
        ]
      );

      await connection.commit();

      const [updated] = await connection.query(
        'SELECT * FROM bank_accounts WHERE id = ?',
        [id]
      );

      connection.release();

      res.json({
        success: true,
        message: 'Bank account updated successfully',
        data: updated[0]
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Bank account update error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update bank account'
      });
    }
  }

  async delete(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { id } = req.params;

      // Soft delete
      await connection.query(
        'UPDATE bank_accounts SET is_active = 0 WHERE id = ?',
        [id]
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: 'Bank account deleted successfully'
      });

    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error('Bank account delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete bank account'
      });
    }
  }

  async getStatement(req, res, next) {
    try {
      const { id } = req.params;
      const { start_date, end_date, limit = 100 } = req.query;

      let where = 'pc.bank_account_id = ?';
      let params = [id];

      if (start_date && end_date) {
        where += ' AND pc.transaction_date BETWEEN ? AND ?';
        params.push(start_date, end_date);
      }

      const sql = `
        SELECT 
          pc.*,
          c.company_name,
          c.contact_person
        FROM petty_cash pc
        LEFT JOIN clients c ON pc.client_id = c.id
        WHERE ${where}
        ORDER BY pc.transaction_date DESC, pc.created_at DESC
        LIMIT ?
      `;

      const transactions = await executeQuery(sql, [...params, parseInt(limit)]);

      res.json({
        success: true,
        data: transactions
      });

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BankAccountController();