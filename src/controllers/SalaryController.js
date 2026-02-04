const BaseModel = require("../models/BaseModel");
const { executeQuery, executeTransaction, getConnection } = require("../config/database");

const SalaryRecord = new BaseModel("salary_records");
const RecurringSchedule = new BaseModel("recurring_expense_schedules");

class SalaryController {
  // ==================== SALARY MANAGEMENT ====================

  async generateMonthlySalaries(req, res, next) {
    try {
      const { month } = req.body; // Format: YYYY-MM-01

      // Get all active users
      const usersSql = `SELECT id, full_name FROM users WHERE is_active = 1`;
      const users = await executeQuery(usersSql);

      // Check if salaries already generated for this month
      const existingSql = `SELECT COUNT(*) as count FROM salary_records WHERE month = ?`;
      const [existing] = await executeQuery(existingSql, [month]);

      if (existing.count > 0) {
        return res.status(400).json({
          success: false,
          error: "Salaries already generated for this month",
        });
      }

      const salaryQueries = [];

      // For demo, using default salary of 50000
      // In production, you'd have a salary structure table
      for (const user of users) {
        salaryQueries.push({
          sql: `INSERT INTO salary_records 
                (user_id, month, basic_salary, allowances, deductions, status)
                VALUES (?, ?, 50000, 5000, 2000, 'pending')`,
          params: [user.id, month],
        });
      }

      await executeTransaction(salaryQueries);

      res.json({
        success: true,
        message: `Salaries generated for ${users.length} employees`,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalaries(req, res, next) {
    try {
      const { month, employee_id, status, limit = 50, offset = 0 } = req.query;

      let where = "1=1";
      let params = [];

      if (month) {
        where += " AND month = ?";
        params.push(month);
      }

      if (employee_id) {
        where += " AND employee_id = ?";
        params.push(employee_id);
      }

      if (status) {
        where += " AND status = ?";
        params.push(status);
      }

      // const sql = `
      //   SELECT sr.*, u.full_name, u.email, ba.bank_name, ba.account_number
      //   FROM salary_records sr
      //   LEFT JOIN users u ON sr.user_id = u.id
      //   LEFT JOIN bank_accounts ba ON sr.bank_account_id = ba.id
      //   WHERE ${where}
      //   ORDER BY sr.month DESC, u.full_name ASC
      //   LIMIT ? OFFSET ?
      // `;
      const sql = `
        SELECT sr.*, e.full_name, e.email, e.bank_name, e.account_number
        FROM salary_records sr
        LEFT JOIN employees e ON sr.employee_id = e.id
        WHERE ${where}
        ORDER BY sr.month DESC, e.full_name ASC
        LIMIT ? OFFSET ?
      `;

      const salaries = await executeQuery(sql, [
        ...params,
        parseInt(limit),
        parseInt(offset),
      ]);
      const total = await SalaryRecord.count(where, params);

      res.json({ success: true, data: { salaries, total } });
    } catch (error) {
      next(error);
    }
  }

  async updateSalary(req, res, next) {
    try {
      const { id } = req.params;
      const { basic_salary, allowances, deductions, notes } = req.body;

      const updates = {};
      if (basic_salary !== undefined) updates.basic_salary = basic_salary;
      if (allowances !== undefined) updates.allowances = allowances;
      if (deductions !== undefined) updates.deductions = deductions;
      if (notes !== undefined) updates.notes = notes;

      const salary = await SalaryRecord.update(id, updates);

      res.json({ success: true, data: salary });
    } catch (error) {
      next(error);
    }
  }

  async paySalary(req, res, next) {
    try {
      const { id } = req.params;
      const { payment_method, bank_account_id } = req.body;

      const salary = await SalaryRecord.findById(id);

      if (!salary) {
        return res.status(404).json({
          success: false,
          error: "Salary record not found",
        });
      }

      if (salary.status === "paid") {
        return res.status(400).json({
          success: false,
          error: "Salary already paid",
        });
      }

      const queries = [
        {
          sql: `UPDATE salary_records 
                SET status = 'paid', payment_date = CURDATE(), 
                    payment_method = ?, bank_account_id = ?
                WHERE id = ?`,
          params: [payment_method, bank_account_id, id],
        },
      ];

      // If bank transfer, record bank transaction
      if (payment_method === "bank_transfer" && bank_account_id) {
        const bankAccount = await executeQuery(
          "SELECT current_balance FROM bank_accounts WHERE id = ?",
          [bank_account_id],
        );

        if (bankAccount.length > 0) {
          const newBalance =
            parseFloat(bankAccount[0].current_balance) -
            parseFloat(salary.net_salary);

          queries.push({
            sql: `INSERT INTO bank_transactions 
                  (bank_account_id, transaction_date, transaction_type, amount, 
                   reference_type, reference_id, description, balance_after)
                  VALUES (?, CURDATE(), 'debit', ?, 'salary', ?, ?, ?)`,
            params: [
              bank_account_id,
              salary.net_salary,
              id,
              `Salary payment for ${salary.month}`,
              newBalance,
            ],
          });

          queries.push({
            sql: `UPDATE bank_accounts SET current_balance = ? WHERE id = ?`,
            params: [newBalance, bank_account_id],
          });
        }
      }

      // Record in cash flow
      queries.push({
        sql: `INSERT INTO cash_flow 
              (transaction_date, flow_type, category, amount, payment_method, 
               bank_account_id, reference_type, reference_id, description)
              VALUES (CURDATE(), 'outflow', 'salary', ?, ?, ?, 'salary', ?, ?)`,
        params: [
          salary.net_salary,
          payment_method,
          bank_account_id,
          id,
          `Salary payment for employee`,
        ],
      });

      // Record as expense
      queries.push({
        sql: `INSERT INTO expenses 
              (expense_number, category_id, expense_date, amount, payment_method, 
               vendor_name, description, created_by)
              VALUES (?, 3, CURDATE(), ?, ?, ?, ?, ?)`,
        params: [
          `SAL-${Date.now()}`,
          salary.net_salary,
          payment_method,
          `Employee Salary`,
          `Salary payment for month ${salary.month}`,
          req.user?.id,
        ],
      });

      await executeTransaction(queries);

      res.json({ success: true, message: "Salary paid successfully" });
    } catch (error) {
      next(error);
    }
  }

  async getSalaryReport(req, res, next) {
    try {
      const { month, start_month, end_month } = req.query;

      let dateFilter = "1=1";
      let params = [];

      if (month) {
        dateFilter = "month = ?";
        params.push(month);
      } else if (start_month && end_month) {
        dateFilter = "month BETWEEN ? AND ?";
        params.push(start_month, end_month);
      }

      const sql = `
        SELECT 
          month,
          COUNT(*) as employee_count,
          SUM(basic_salary) as total_basic,
          SUM(allowances) as total_allowances,
          SUM(deductions) as total_deductions,
          SUM(net_salary) as total_net,
          SUM(CASE WHEN status = 'paid' THEN net_salary ELSE 0 END) as total_paid,
          SUM(CASE WHEN status = 'pending' THEN net_salary ELSE 0 END) as total_pending
        FROM salary_records
        WHERE ${dateFilter}
        GROUP BY month
        ORDER BY month DESC
      `;

      const report = await executeQuery(sql, params);

      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }

  // ==================== RECURRING EXPENSES ====================

  async createRecurringSchedule(req, res, next) {
    try {
      const schedule = await RecurringSchedule.create({
        ...req.body,
        last_generated: null,
      });

      res.status(201).json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }

  async getRecurringSchedules(req, res, next) {
    try {
      const { frequency, is_active } = req.query;

      let where = "1=1";
      let params = [];

      if (frequency) {
        where += " AND frequency = ?";
        params.push(frequency);
      }

      if (is_active !== undefined) {
        where += " AND is_active = ?";
        params.push(is_active);
      }

      const sql = `
        SELECT rs.*, ec.name as category_name, ba.bank_name
        FROM recurring_expense_schedules rs
        LEFT JOIN expense_categories ec ON rs.expense_category_id = ec.id
        LEFT JOIN bank_accounts ba ON rs.bank_account_id = ba.id
        WHERE ${where}
        ORDER BY rs.next_due_date ASC
      `;

      const schedules = await executeQuery(sql, params);

      res.json({ success: true, data: schedules });
    } catch (error) {
      next(error);
    }
  }

  async updateRecurringSchedule(req, res, next) {
    try {
      const { id } = req.params;
      const schedule = await RecurringSchedule.update(id, req.body);

      res.json({ success: true, data: schedule });
    } catch (error) {
      next(error);
    }
  }

  async processRecurringExpenses(req, res, next) {
    try {
      // Get all active schedules that are due
      const sql = `
        SELECT * FROM recurring_expense_schedules 
        WHERE is_active = 1 
        AND auto_generate = 1 
        AND next_due_date <= CURDATE()
        AND (end_date IS NULL OR end_date >= CURDATE())
      `;

      const schedules = await executeQuery(sql);

      const generatedExpenses = [];

      for (const schedule of schedules) {
        // Create expense
        const expenseNumber = `EXP-REC-${Date.now()}-${schedule.id}`;

        const expenseQueries = [
          {
            sql: `INSERT INTO expenses 
                  (expense_number, category_id, expense_date, amount, payment_method, 
                   vendor_name, description, is_recurring, recurring_frequency, 
                   warehouse_id, created_by)
                  VALUES (?, ?, CURDATE(), ?, ?, ?, ?, 1, ?, ?, ?)`,
            params: [
              expenseNumber,
              schedule.expense_category_id,
              schedule.amount,
              schedule.payment_method,
              schedule.vendor_name,
              `Auto-generated: ${schedule.name}`,
              schedule.frequency,
              null,
              null,
            ],
          },
        ];

        // Calculate next due date
        let nextDueDate = new Date(schedule.next_due_date);

        switch (schedule.frequency) {
          case "daily":
            nextDueDate.setDate(nextDueDate.getDate() + 1);
            break;
          case "weekly":
            nextDueDate.setDate(nextDueDate.getDate() + 7);
            break;
          case "monthly":
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
            break;
          case "quarterly":
            nextDueDate.setMonth(nextDueDate.getMonth() + 3);
            break;
          case "yearly":
            nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
            break;
        }

        // Update schedule
        expenseQueries.push({
          sql: `UPDATE recurring_expense_schedules 
                SET last_generated = CURDATE(), next_due_date = ?
                WHERE id = ?`,
          params: [nextDueDate.toISOString().split("T")[0], schedule.id],
        });

        // Record in cash flow
        if (schedule.bank_account_id) {
          expenseQueries.push({
            sql: `INSERT INTO cash_flow 
                  (transaction_date, flow_type, category, amount, payment_method, 
                   bank_account_id, reference_type, reference_id, description)
                  VALUES (CURDATE(), 'outflow', 'expenses', ?, ?, ?, 'recurring_expense', ?, ?)`,
            params: [
              schedule.amount,
              schedule.payment_method,
              schedule.bank_account_id,
              schedule.id,
              schedule.name,
            ],
          });
        }

        await executeTransaction(expenseQueries);

        generatedExpenses.push({
          schedule_id: schedule.id,
          schedule_name: schedule.name,
          expense_number: expenseNumber,
          amount: schedule.amount,
        });
      }

      res.json({
        success: true,
        message: `Generated ${generatedExpenses.length} recurring expenses`,
        data: generatedExpenses,
      });
    } catch (error) {
      next(error);
    }
  }

  async getUpcomingRecurringExpenses(req, res, next) {
    try {
      const { days = 30 } = req.query;

      const sql = `
        SELECT rs.*, ec.name as category_name,
               DATEDIFF(rs.next_due_date, CURDATE()) as days_until_due
        FROM recurring_expense_schedules rs
        LEFT JOIN expense_categories ec ON rs.expense_category_id = ec.id
        WHERE rs.is_active = 1
        AND rs.next_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY rs.next_due_date ASC
      `;

      const upcoming = await executeQuery(sql, [parseInt(days)]);

      const totalAmount = upcoming.reduce(
        (sum, item) => sum + parseFloat(item.amount),
        0,
      );

      res.json({
        success: true,
        data: {
          upcoming_expenses: upcoming,
          total_amount: totalAmount,
          count: upcoming.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
  // Add these new methods to existing SalaryController

  async generateSalaryForEmployee(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const {
        employee_id,
        month, // YYYY-MM-01
        bonus = 0,
        overtime = 0,
        leaves_deduction = 0,
        loan_deduction = 0,
        other_deductions = 0,
        notes,
      } = req.body;

      // Get employee details
      const [employee] = await connection.query(
        "SELECT * FROM employees WHERE id = ? AND is_active = 1",
        [employee_id],
      );

      if (!employee || employee.length === 0) {
        throw new Error("Employee not found");
      }

      const emp = employee[0];

      // Check if already generated
      const [existing] = await connection.query(
        "SELECT id FROM salary_records WHERE employee_id = ? AND month = ?",
        [employee_id, month],
      );

      if (existing && existing.length > 0) {
        throw new Error("Salary already generated for this month");
      }

      // Calculate salary
      const basic_salary = parseFloat(emp.basic_salary);
      const allowances = parseFloat(emp.allowances || 0);
      const bonusAmt = parseFloat(bonus);
      const overtimeAmt = parseFloat(overtime);

      const gross_salary = basic_salary + allowances + bonusAmt + overtimeAmt;
      
      const total_deductions =
        parseFloat(leaves_deduction) +
        parseFloat(loan_deduction) +
        parseFloat(other_deductions);

      const net_salary = gross_salary - total_deductions;
      // Insert salary record
      const [result] = await connection.query(
        `INSERT INTO salary_records 
      (employee_id, user_id, month, 
       basic_salary, allowances, bonus, overtime,
       deductions, leaves_deduction, loan_deduction, other_deductions,
       gross_salary, net_salary, status, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        [
          employee_id,
          req.user?.id || null,
          month,
          basic_salary,
          allowances,
          bonusAmt,
          overtimeAmt,
          total_deductions,
          leaves_deduction,
          loan_deduction,
          other_deductions,
          gross_salary,
          net_salary,
          notes || null,
          req.user?.id,
        ],
      );

      await connection.commit();
      console.log(result);
      
      const [newSalary] = await connection.query(
        "SELECT * FROM salary_records WHERE id = ?",
        [result.insertId],
      );

      connection.release();

      res.status(201).json({
        success: true,
        message: "Salary generated successfully",
        data: newSalary[0],
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error("Salary generation error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to generate salary",
      });
    }
  }

  async paySalary(req, res, next) {
    let connection;
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      const { id } = req.params;
      const {
        payment_type, // 'cash', 'bank', 'cheque'
        bank_account_id,
        cheque_number,
        cheque_date,
        payment_date,
        client_id
      } = req.body;

      // Get salary record
      const [salary] = await connection.query(
        `SELECT sr.*, e.full_name, e.emp_code 
       FROM salary_records sr
       JOIN employees e ON sr.employee_id = e.id
       WHERE sr.id = ?`,
        [id],
      );

      if (!salary || salary.length === 0) {
        throw new Error("Salary record not found");
      }

      const salaryRecord = salary[0];

      if (salaryRecord.status === "paid") {
        throw new Error("Salary already paid");
      }

      const payDate = payment_date || new Date().toISOString().split("T")[0];

      // Update salary record
      await connection.query(
        `UPDATE salary_records 
       SET status = 'paid',
           payment_date = ?,
           payment_type = ?,
           payment_method = ?,
           bank_account_id = ?,
           cheque_number = ?,
           cheque_date = ?
       WHERE id = ?`,
        [
          payDate,
          payment_type,
          payment_type, // Also update payment_method for compatibility
          bank_account_id || null,
          cheque_number || null,
          cheque_date || null,
          id,
        ],
      );

      // Create petty cash entry
      const pcNumber = `SAL-${Date.now()}`;

      await connection.query(
        `INSERT INTO petty_cash 
      (transaction_number, transaction_date, transaction_type, payment_method,
       bank_account_id, cheque_number, cheque_date, payment_status,
       amount, reference_type, reference_id, description, created_by, client_id)
      VALUES (?, ?, 'cash_out', ?, ?, ?, ?, 'cleared', ?, 'salary', ?, ?, ?, ?)`,
        [
          pcNumber,
          payDate,
          payment_type,
          bank_account_id || null,
          cheque_number || null,
          cheque_date || null,
          salaryRecord.net_salary,
          id,
          `Salary payment for ${salaryRecord.full_name} (${salaryRecord.emp_code}) - ${salaryRecord.month}`,
          req.user?.id,
          client_id
        ],
      );

      await connection.commit();
      connection.release();

      res.json({
        success: true,
        message: "Salary paid successfully",
        data: {
          salary_id: id,
          employee: salaryRecord.full_name,
          amount: salaryRecord.net_salary,
          payment_type,
          payment_date: payDate,
        },
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
        connection.release();
      }
      console.error("Salary payment error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to pay salary",
      });
    }
  }

  async getSalaryReport(req, res, next) {
    try {
      const { start_month, end_month, department, employee_id, status } =
        req.query;

      let where = "1=1";
      let params = [];

      if (start_month && end_month) {
        where += " AND sr.month BETWEEN ? AND ?";
        params.push(start_month, end_month);
      }

      if (department) {
        where += " AND e.department = ?";
        params.push(department);
      }

      if (employee_id) {
        where += " AND sr.employee_id = ?";
        params.push(employee_id);
      }

      if (status) {
        where += " AND sr.status = ?";
        params.push(status);
      }

      const sql = `
      SELECT 
        sr.*,
        e.emp_code,
        e.full_name,
        e.department,
        e.designation,
        ba.bank_name,
        ba.account_number,
        CASE 
          WHEN sr.payment_type = 'bank' THEN CONCAT(ba.bank_name, ' - ', ba.account_number)
          WHEN sr.payment_type = 'cheque' THEN CONCAT('Cheque #', sr.cheque_number)
          ELSE 'Cash'
        END as payment_details
      FROM salary_records sr
      JOIN employees e ON sr.employee_id = e.id
      LEFT JOIN bank_accounts ba ON sr.bank_account_id = ba.id
      WHERE ${where}
      ORDER BY sr.month DESC, e.full_name ASC
    `;

      const records = await executeQuery(sql, params);

      // Calculate totals
      const totals = {
        total_employees: new Set(records.map((r) => r.employee_id)).size,
        total_gross_salary: records.reduce(
          (sum, r) => sum + parseFloat(r.gross_salary || 0),
          0,
        ),
        total_deductions: records.reduce(
          (sum, r) => sum + parseFloat(r.deductions || 0),
          0,
        ),
        total_net_salary: records.reduce(
          (sum, r) => sum + parseFloat(r.net_salary || 0),
          0,
        ),
        total_paid: records
          .filter((r) => r.status === "paid")
          .reduce((sum, r) => sum + parseFloat(r.net_salary), 0),
        total_pending: records
          .filter((r) => r.status === "pending")
          .reduce((sum, r) => sum + parseFloat(r.net_salary), 0),
        by_payment_type: {
          cash: records
            .filter((r) => r.payment_type === "cash" && r.status === "paid")
            .reduce((sum, r) => sum + parseFloat(r.net_salary), 0),
          bank: records
            .filter((r) => r.payment_type === "bank" && r.status === "paid")
            .reduce((sum, r) => sum + parseFloat(r.net_salary), 0),
          cheque: records
            .filter((r) => r.payment_type === "cheque" && r.status === "paid")
            .reduce((sum, r) => sum + parseFloat(r.net_salary), 0),
        },
      };

      res.json({
        success: true,
        data: {
          records,
          totals,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SalaryController();
