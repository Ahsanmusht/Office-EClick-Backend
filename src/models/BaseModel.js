const { executeQuery, executeTransaction } = require("../config/database");

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
  }

  async findAll(options = {}) {
    const {
      limit = 20,
      offset = 0,
      where = "",
      orderBy = "id DESC",
      params = [],
    } = options;

    let sql = `SELECT * FROM ${this.tableName}`;
    if (where) sql += ` WHERE ${where}`;
    sql += ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

    return await executeQuery(sql, [...params, limit, offset]);
  }

  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    const results = await executeQuery(sql, [id]);
    return results[0] || null;
  }

  async create(data) {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const placeholders = fields.map(() => "?").join(", ");

    const sql = `INSERT INTO ${this.tableName} (${fields.join(
      ", "
    )}) VALUES (${placeholders})`;
    const result = await executeQuery(sql, values);

    return await this.findById(result.insertId);
  }

  async update(id, data) {
    const fields = Object.keys(data);
    const values = Object.values(data);
    const setClause = fields.map((field) => `${field} = ?`).join(", ");

    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    await executeQuery(sql, [...values, id]);

    return await this.findById(id);
  }

  async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await executeQuery(sql, [id]);
    return result.affectedRows > 0;
  }

  async count(where = "", params = []) {
    let sql = `SELECT COUNT(*) as total FROM ${this.tableName}`;
    if (where) sql += ` WHERE ${where}`;

    const results = await executeQuery(sql, params);
    return results[0].total;
  }
}

module.exports = BaseModel;
