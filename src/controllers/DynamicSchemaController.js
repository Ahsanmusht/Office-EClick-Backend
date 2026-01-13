const DynamicSchemaService = require("../services/DynamicSchemaService");

class DynamicSchemaController {
  async createEntity(req, res, next) {
    try {
      const entity = await DynamicSchemaService.createEntity(req.body);
      res.status(201).json({ success: true, data: entity });
    } catch (error) {
      next(error);
    }
  }

  async addAttribute(req, res, next) {
    try {
      const attribute = await DynamicSchemaService.addAttribute(req.body);
      res.status(201).json({ success: true, data: attribute });
    } catch (error) {
      next(error);
    }
  }

  async getSchema(req, res, next) {
    try {
      const { entityName } = req.params;
      const schema = await DynamicSchemaService.getEntitySchema(entityName);

      if (!schema) {
        return res
          .status(404)
          .json({ success: false, error: "Entity not found" });
      }

      res.json({ success: true, data: schema });
    } catch (error) {
      next(error);
    }
  }

  async createRecord(req, res, next) {
    try {
      const { entityName } = req.params;
      const recordId = `${entityName}_${Date.now()}`;

      const record = await DynamicSchemaService.saveRecord(
        entityName,
        recordId,
        req.body
      );
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  }

  async updateRecord(req, res, next) {
    try {
      const { entityName, recordId } = req.params;
      const record = await DynamicSchemaService.saveRecord(
        entityName,
        recordId,
        req.body
      );
      res.json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  }

  async getRecord(req, res, next) {
    try {
      const { entityName, recordId } = req.params;
      const record = await DynamicSchemaService.getRecord(entityName, recordId);

      if (!record) {
        return res
          .status(404)
          .json({ success: false, error: "Record not found" });
      }

      res.json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  }

  async listRecords(req, res, next) {
    try {
      const { entityName } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const result = await DynamicSchemaService.listRecords(entityName, {
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async deleteRecord(req, res, next) {
    try {
      const { entityName, recordId } = req.params;
      const deleted = await DynamicSchemaService.deleteRecord(
        entityName,
        recordId
      );

      if (!deleted) {
        return res
          .status(404)
          .json({ success: false, error: "Record not found" });
      }

      res.json({ success: true, message: "Record deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DynamicSchemaController();
