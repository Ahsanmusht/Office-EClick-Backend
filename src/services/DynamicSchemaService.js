const { executeQuery, executeTransaction } = require("../config/database");

class DynamicSchemaService {
  // Create new entity type
  async createEntity(entityData) {
    const { entity_name, display_name, description } = entityData;

    const sql = `INSERT INTO system_entities (entity_name, display_name, description, is_system) 
                 VALUES (?, ?, ?, 0)`;

    const result = await executeQuery(sql, [
      entity_name,
      display_name,
      description,
    ]);
    return { id: result.insertId, entity_name, display_name };
  }

  // Add attribute to entity
  async addAttribute(attributeData) {
    const {
      entity_id,
      attribute_name,
      display_name,
      data_type,
      is_required,
      is_unique,
      default_value,
      validation_rules,
    } = attributeData;

    const sql = `INSERT INTO system_attributes 
                 (entity_id, attribute_name, display_name, data_type, is_required, is_unique, 
                  default_value, validation_rules) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const result = await executeQuery(sql, [
      entity_id,
      attribute_name,
      display_name,
      data_type,
      is_required || 0,
      is_unique || 0,
      default_value,
      JSON.stringify(validation_rules || {}),
    ]);

    return { id: result.insertId, ...attributeData };
  }

  // Get entity schema
  async getEntitySchema(entityName) {
    const entitySql = `SELECT * FROM system_entities WHERE entity_name = ? AND is_active = 1`;
    const entities = await executeQuery(entitySql, [entityName]);

    if (!entities.length) return null;

    const entity = entities[0];

    const attrSql = `SELECT * FROM system_attributes WHERE entity_id = ? AND is_active = 1 ORDER BY sort_order`;
    const attributes = await executeQuery(attrSql, [entity.id]);

    return { ...entity, attributes };
  }

  // Save dynamic data
  async saveRecord(entityName, recordId, data) {
    const schema = await this.getEntitySchema(entityName);
    if (!schema) throw new Error("Entity not found");

    const queries = [];

    for (const [key, value] of Object.entries(data)) {
      const attribute = schema.attributes.find(
        (attr) => attr.attribute_name === key
      );
      if (!attribute) continue;

      const valueField = this.getValueField(attribute.data_type);

      queries.push({
        sql: `INSERT INTO dynamic_data (entity_id, record_id, attribute_id, ${valueField})
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE ${valueField} = VALUES(${valueField})`,
        params: [schema.id, recordId, attribute.id, value],
      });
    }

    await executeTransaction(queries);
    return this.getRecord(entityName, recordId);
  }

  // Get dynamic record
  async getRecord(entityName, recordId) {
    const schema = await this.getEntitySchema(entityName);
    if (!schema) return null;

    const sql = `SELECT a.attribute_name, a.data_type, 
                 d.value_string, d.value_number, d.value_decimal, 
                 d.value_date, d.value_datetime, d.value_boolean, 
                 d.value_text, d.value_json
                 FROM system_attributes a
                 LEFT JOIN dynamic_data d ON a.id = d.attribute_id 
                   AND d.entity_id = ? AND d.record_id = ?
                 WHERE a.entity_id = ? AND a.is_active = 1`;

    const rows = await executeQuery(sql, [schema.id, recordId, schema.id]);

    const record = { _id: recordId };
    for (const row of rows) {
      const valueField = this.getValueField(row.data_type);
      record[row.attribute_name] = row[valueField];
    }

    return record;
  }

  // List records
  async listRecords(entityName, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const schema = await this.getEntitySchema(entityName);
    if (!schema) return { records: [], total: 0 };

    const recordIdsSql = `SELECT DISTINCT record_id FROM dynamic_data 
                          WHERE entity_id = ? LIMIT ? OFFSET ?`;
    const recordIds = await executeQuery(recordIdsSql, [
      schema.id,
      limit,
      offset,
    ]);

    const records = [];
    for (const { record_id } of recordIds) {
      const record = await this.getRecord(entityName, record_id);
      records.push(record);
    }

    const countSql = `SELECT COUNT(DISTINCT record_id) as total FROM dynamic_data WHERE entity_id = ?`;
    const [{ total }] = await executeQuery(countSql, [schema.id]);

    return { records, total };
  }

  // Delete record
  async deleteRecord(entityName, recordId) {
    const schema = await this.getEntitySchema(entityName);
    if (!schema) return false;

    const sql = `DELETE FROM dynamic_data WHERE entity_id = ? AND record_id = ?`;
    const result = await executeQuery(sql, [schema.id, recordId]);
    return result.affectedRows > 0;
  }

  getValueField(dataType) {
    const fieldMap = {
      string: "value_string",
      number: "value_number",
      decimal: "value_decimal",
      date: "value_date",
      datetime: "value_datetime",
      boolean: "value_boolean",
      text: "value_text",
      json: "value_json",
    };
    return fieldMap[dataType] || "value_string";
  }
}

module.exports = new DynamicSchemaService();
