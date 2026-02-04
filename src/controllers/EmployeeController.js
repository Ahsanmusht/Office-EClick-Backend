const BaseModel = require("../models/BaseModel");
const { executeQuery, getConnection } = require("../config/database");

const Employee = new BaseModel("employees");

class EmployeeController {
  // Get all employees
  async getAll(req, res, next) {
    try {
      const {
        limit = 20,
        offset = 0,
        department,
        is_active = 1,
        search,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (is_active !== undefined) {
        where += " AND is_active = ?";
        params.push(is_active);
      }

      if (department) {
        where += " AND department = ?";
        params.push(department);
      }

      if (search) {
        where += " AND (full_name LIKE ? OR emp_code LIKE ? OR email LIKE ?)";
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      const employees = await Employee.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "full_name ASC",
      });

      const total = await Employee.count(where, params);

      res.json({
        success: true,
        data: { employees, total },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get employee by ID
  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const employee = await Employee.findById(id);

      if (!employee) {
        return res.status(404).json({
          success: false,
          error: "Employee not found",
        });
      }

      // Get salary history
      const salarySql = `
        SELECT * FROM salary_records 
        WHERE employee_id = ? 
        ORDER BY month DESC 
        LIMIT 12
      `;
      const salaryHistory = await executeQuery(salarySql, [id]);

      res.json({
        success: true,
        data: {
          ...employee,
          salary_history: salaryHistory,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Create employee
  async create(req, res, next) {
    try {
      const {
        full_name,
        email,
        phone,
        cnic,
        address,
        department,
        designation,
        date_of_joining,
        employment_type,
        basic_salary,
        allowances,
        bank_name,
        account_number,
        account_title,
      } = req.body;

      // Generate employee code
      const [lastEmp] = await executeQuery(
        "SELECT emp_code FROM employees ORDER BY id DESC LIMIT 1",
      );

      let nextEmpCode = "EMP001";
      if (lastEmp && lastEmp.emp_code) {
        const lastNum = parseInt(lastEmp.emp_code.replace("EMP", ""), 10);
        nextEmpCode = "EMP" + String(lastNum + 1).padStart(3, "0");
      }

      const employee = await Employee.create({
        emp_code: nextEmpCode,
        full_name,
        email,
        phone,
        cnic,
        address,
        department,
        designation,
        date_of_joining,
        employment_type: employment_type || "permanent",
        basic_salary,
        allowances: allowances || 0,
        bank_name,
        account_number,
        account_title,
        is_active: 1,
      });

      res.status(201).json({
        success: true,
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update employee
  async update(req, res, next) {
    try {
      const { id } = req.params;

      const employee = await Employee.update(id, req.body);

      if (!employee) {
        return res.status(404).json({
          success: false,
          error: "Employee not found",
        });
      }

      res.json({
        success: true,
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete (soft delete)
  async delete(req, res, next) {
    try {
      const { id } = req.params;

      await Employee.update(id, { is_active: 0 });

      res.json({
        success: true,
        message: "Employee deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  // Get employee salary details
  async getSalaryDetails(req, res, next) {
    try {
      const { id } = req.params;

      const employee = await Employee.findById(id);

      if (!employee) {
        return res.status(404).json({
          success: false,
          error: "Employee not found",
        });
      }

      // Get last 12 months salary
      const salarySql = `
        SELECT 
          sr.*,
          ba.bank_name,
          ba.account_number
        FROM salary_records sr
        LEFT JOIN bank_accounts ba ON sr.bank_account_id = ba.id
        WHERE sr.employee_id = ?
        ORDER BY sr.month DESC
        LIMIT 12
      `;
      const salaryRecords = await executeQuery(salarySql, [id]);

      // Calculate totals
      const totals = {
        total_paid: salaryRecords
          .filter((s) => s.status === "paid")
          .reduce((sum, s) => sum + parseFloat(s.net_salary), 0),
        total_pending: salaryRecords
          .filter((s) => s.status === "pending")
          .reduce((sum, s) => sum + parseFloat(s.net_salary), 0),
        total_bonus: salaryRecords.reduce(
          (sum, s) => sum + parseFloat(s.bonus || 0),
          0,
        ),
        total_deductions: salaryRecords.reduce(
          (sum, s) => sum + parseFloat(s.deductions || 0),
          0,
        ),
      };

      res.json({
        success: true,
        data: {
          employee: {
            id: employee.id,
            emp_code: employee.emp_code,
            full_name: employee.full_name,
            department: employee.department,
            designation: employee.designation,
            basic_salary: employee.basic_salary,
            allowances: employee.allowances,
          },
          salary_records: salaryRecords,
          totals,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EmployeeController();
