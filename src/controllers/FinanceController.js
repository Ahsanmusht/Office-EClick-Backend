const BaseModel = require("../models/BaseModel");
const { executeQuery, executeTransaction } = require("../config/database");

const BankAccount = new BaseModel("bank_accounts");
const BankTransaction = new BaseModel("bank_transactions");
const CashFlow = new BaseModel("cash_flow");
const Budget = new BaseModel("budgets");

class FinanceController {
  // ==================== BANK ACCOUNTS ====================

  async getBankAccounts(req, res, next) {
    try {
      const accounts = await BankAccount.findAll({
        where: "is_active = 1",
        orderBy: "bank_name ASC",
      });

      // Get recent transactions for each account
      for (let account of accounts) {
        const sql = `SELECT * FROM bank_transactions 
                     WHERE bank_account_id = ? 
                     ORDER BY transaction_date DESC LIMIT 5`;
        account.recent_transactions = await executeQuery(sql, [account.id]);
      }

      res.json({ success: true, data: accounts });
    } catch (error) {
      next(error);
    }
  }

  async createBankAccount(req, res, next) {
    try {
      const account = await BankAccount.create({
        ...req.body,
        current_balance: req.body.opening_balance || 0,
      });
      res.status(201).json({ success: true, data: account });
    } catch (error) {
      next(error);
    }
  }

  async updateBankAccount(req, res, next) {
    try {
      const { id } = req.params;
      const account = await BankAccount.update(id, req.body);
      res.json({ success: true, data: account });
    } catch (error) {
      next(error);
    }
  }

  // ==================== BANK TRANSACTIONS ====================

  async recordBankTransaction(req, res, next) {
    try {
      const {
        bank_account_id,
        transaction_type,
        amount,
        description,
        reference_type,
        reference_id,
      } = req.body;

      const account = await BankAccount.findById(bank_account_id);
      if (!account) {
        return res
          .status(404)
          .json({ success: false, error: "Bank account not found" });
      }

      // Calculate new balance
      const currentBalance = parseFloat(account.current_balance);
      const transactionAmount = parseFloat(amount);
      const newBalance =
        transaction_type === "credit"
          ? currentBalance + transactionAmount
          : currentBalance - transactionAmount;

      if (transaction_type === "debit" && newBalance < 0) {
        return res.status(400).json({
          success: false,
          error: "Insufficient balance",
        });
      }

      const queries = [
        {
          sql: `INSERT INTO bank_transactions 
                (bank_account_id, transaction_date, transaction_type, amount, 
                 reference_type, reference_id, description, balance_after)
                VALUES (?, CURDATE(), ?, ?, ?, ?, ?, ?)`,
          params: [
            bank_account_id,
            transaction_type,
            amount,
            reference_type,
            reference_id,
            description,
            newBalance,
          ],
        },
        {
          sql: `UPDATE bank_accounts SET current_balance = ? WHERE id = ?`,
          params: [newBalance, bank_account_id],
        },
      ];

      const [result] = await executeTransaction(queries);

      // Record in cash flow
      await CashFlow.create({
        transaction_date: new Date().toISOString().split("T")[0],
        flow_type: transaction_type === "credit" ? "inflow" : "outflow",
        category: "other",
        amount,
        payment_method: "bank_transfer",
        bank_account_id,
        reference_type,
        reference_id,
        description,
      });

      res.status(201).json({
        success: true,
        data: { id: result.insertId, new_balance: newBalance },
      });
    } catch (error) {
      next(error);
    }
  }

  async getBankTransactions(req, res, next) {
    try {
      const {
        bank_account_id,
        start_date,
        end_date,
        limit = 50,
        offset = 0,
      } = req.query;

      let where = "1=1";
      let params = [];

      if (bank_account_id) {
        where += " AND bank_account_id = ?";
        params.push(bank_account_id);
      }

      if (start_date && end_date) {
        where += " AND transaction_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      const transactions = await BankTransaction.findAll({
        limit,
        offset,
        where,
        params,
        orderBy: "transaction_date DESC",
      });

      const total = await BankTransaction.count(where, params);

      res.json({ success: true, data: { transactions, total } });
    } catch (error) {
      next(error);
    }
  }

  async reconcileBankAccount(req, res, next) {
    try {
      const { bank_account_id } = req.params;
      const { statement_balance, reconciliation_date } = req.body;

      const account = await BankAccount.findById(bank_account_id);
      const systemBalance = parseFloat(account.current_balance);
      const statementBalance = parseFloat(statement_balance);

      const difference = Math.abs(systemBalance - statementBalance);

      res.json({
        success: true,
        data: {
          system_balance: systemBalance,
          statement_balance: statementBalance,
          difference,
          is_reconciled: difference < 0.01,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== CASH FLOW ====================

  async getCashFlow(req, res, next) {
    try {
      const { start_date, end_date, category, flow_type } = req.query;

      let where = "1=1";
      let params = [];

      if (start_date && end_date) {
        where += " AND transaction_date BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      if (category) {
        where += " AND category = ?";
        params.push(category);
      }

      if (flow_type) {
        where += " AND flow_type = ?";
        params.push(flow_type);
      }

      const cashFlows = await CashFlow.findAll({
        where,
        params,
        orderBy: "transaction_date DESC",
      });

      // Calculate summary
      const summary = {
        total_inflow: 0,
        total_outflow: 0,
        net_cash_flow: 0,
      };

      cashFlows.forEach((cf) => {
        const amount = parseFloat(cf.amount);
        if (cf.flow_type === "inflow") {
          summary.total_inflow += amount;
        } else {
          summary.total_outflow += amount;
        }
      });

      summary.net_cash_flow = summary.total_inflow - summary.total_outflow;

      res.json({ success: true, data: { cash_flows: cashFlows, summary } });
    } catch (error) {
      next(error);
    }
  }

  async getCashFlowForecast(req, res, next) {
    try {
      const { months = 3 } = req.query;

      // Get historical average
      const sql = `
        SELECT 
          DATE_FORMAT(transaction_date, '%Y-%m') as month,
          SUM(CASE WHEN flow_type = 'inflow' THEN amount ELSE 0 END) as total_inflow,
          SUM(CASE WHEN flow_type = 'outflow' THEN amount ELSE 0 END) as total_outflow
        FROM cash_flow
        WHERE transaction_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
        ORDER BY month DESC
      `;

      const historical = await executeQuery(sql);

      // Calculate averages
      const avgInflow =
        historical.reduce((sum, h) => sum + parseFloat(h.total_inflow), 0) /
        historical.length;
      const avgOutflow =
        historical.reduce((sum, h) => sum + parseFloat(h.total_outflow), 0) /
        historical.length;

      // Generate forecast
      const forecast = [];
      const currentDate = new Date();

      for (let i = 1; i <= months; i++) {
        const forecastDate = new Date(currentDate);
        forecastDate.setMonth(forecastDate.getMonth() + i);

        forecast.push({
          month: forecastDate.toISOString().split("T")[0].substring(0, 7),
          projected_inflow: avgInflow,
          projected_outflow: avgOutflow,
          projected_net: avgInflow - avgOutflow,
        });
      }

      res.json({ success: true, data: { historical, forecast } });
    } catch (error) {
      next(error);
    }
  }

  // ==================== BUDGETS ====================

  async createBudget(req, res, next) {
    try {
      const budget = await Budget.create(req.body);
      res.status(201).json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  }

  async getBudgets(req, res, next) {
    try {
      const { month, category_type } = req.query;

      let where = "1=1";
      let params = [];

      if (month) {
        where += " AND month = ?";
        params.push(month);
      }

      if (category_type) {
        where += " AND category_type = ?";
        params.push(category_type);
      }

      const budgets = await Budget.findAll({
        where,
        params,
        orderBy: "month DESC",
      });

      res.json({ success: true, data: budgets });
    } catch (error) {
      next(error);
    }
  }

  async updateBudgetSpending(req, res, next) {
    try {
      const { id } = req.params;
      const { additional_spent } = req.body;

      const budget = await Budget.findById(id);
      const newSpent =
        parseFloat(budget.spent_amount) + parseFloat(additional_spent);

      await Budget.update(id, { spent_amount: newSpent });

      res.json({ success: true, message: "Budget updated" });
    } catch (error) {
      next(error);
    }
  }

  async getBudgetAnalysis(req, res, next) {
    try {
      const { month } = req.query;

      const sql = `
        SELECT 
          b.*,
          ec.name as category_name,
          CASE 
            WHEN b.spent_amount > b.allocated_amount THEN 'over_budget'
            WHEN b.spent_amount > (b.allocated_amount * 0.9) THEN 'near_limit'
            ELSE 'within_budget'
          END as status,
          ((b.spent_amount / b.allocated_amount) * 100) as utilization_percentage
        FROM budgets b
        LEFT JOIN expense_categories ec ON b.category_id = ec.id
        WHERE b.month = ?
      `;

      const budgets = await executeQuery(sql, [
        month || new Date().toISOString().split("T")[0].substring(0, 7) + "-01",
      ]);

      res.json({ success: true, data: budgets });
    } catch (error) {
      next(error);
    }
  }

  // ==================== FINANCIAL REPORTS ====================

  async getFinancialSummary(req, res, next) {
    try {
      const { start_date, end_date } = req.query;

      const dateFilter =
        start_date && end_date
          ? `BETWEEN '${start_date}' AND '${end_date}'`
          : `>= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;

      // Revenue
      const revenueSql = `
        SELECT COALESCE(SUM(total_amount), 0) as total_revenue
        FROM invoices
        WHERE invoice_type = 'sales' AND invoice_date ${dateFilter}
      `;
      const [revenue] = await executeQuery(revenueSql);

      // Expenses
      const expensesSql = `
        SELECT COALESCE(SUM(amount), 0) as total_expenses
        FROM expenses
        WHERE expense_date ${dateFilter}
      `;
      const [expenses] = await executeQuery(expensesSql);

      // Bank balances
      const bankSql = `SELECT SUM(current_balance) as total_bank_balance FROM bank_accounts WHERE is_active = 1`;
      const [bankBalance] = await executeQuery(bankSql);

      // Outstanding receivables
      const receivablesSql = `
        SELECT COALESCE(SUM(balance_amount), 0) as outstanding_receivables
        FROM invoices
        WHERE invoice_type = 'sales' AND status != 'paid' AND balance_amount > 0
      `;
      const [receivables] = await executeQuery(receivablesSql);

      // Outstanding payables
      const payablesSql = `
        SELECT COALESCE(SUM(balance_amount), 0) as outstanding_payables
        FROM invoices
        WHERE invoice_type = 'purchase' AND status != 'paid' AND balance_amount > 0
      `;
      const [payables] = await executeQuery(payablesSql);

      res.json({
        success: true,
        data: {
          revenue: parseFloat(revenue.total_revenue),
          expenses: parseFloat(expenses.total_expenses),
          net_profit:
            parseFloat(revenue.total_revenue) -
            parseFloat(expenses.total_expenses),
          bank_balance: parseFloat(bankBalance.total_bank_balance || 0),
          outstanding_receivables: parseFloat(
            receivables.outstanding_receivables
          ),
          outstanding_payables: parseFloat(payables.outstanding_payables),
          net_working_capital:
            parseFloat(receivables.outstanding_receivables) -
            parseFloat(payables.outstanding_payables),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getBalanceSheet(req, res, next) {
    try {
      const { as_of_date = new Date().toISOString().split("T")[0] } = req.query;

      // Assets
      const stockValueSql = `
        SELECT COALESCE(SUM(s.quantity * p.base_price), 0) as stock_value
        FROM stock s
        JOIN products p ON s.product_id = p.id
      `;
      const [stockValue] = await executeQuery(stockValueSql);

      const bankBalanceSql = `SELECT COALESCE(SUM(current_balance), 0) as bank_balance FROM bank_accounts WHERE is_active = 1`;
      const [bankBalance] = await executeQuery(bankBalanceSql);

      const receivablesSql = `SELECT COALESCE(SUM(balance_amount), 0) as receivables FROM invoices WHERE invoice_type = 'sales' AND status != 'paid'`;
      const [receivables] = await executeQuery(receivablesSql);

      // Liabilities
      const payablesSql = `SELECT COALESCE(SUM(balance_amount), 0) as payables FROM invoices WHERE invoice_type = 'purchase' AND status != 'paid'`;
      const [payables] = await executeQuery(payablesSql);

      const totalAssets =
        parseFloat(stockValue.stock_value) +
        parseFloat(bankBalance.bank_balance) +
        parseFloat(receivables.receivables);
      const totalLiabilities = parseFloat(payables.payables);
      const equity = totalAssets - totalLiabilities;

      res.json({
        success: true,
        data: {
          as_of_date,
          assets: {
            stock_value: parseFloat(stockValue.stock_value),
            bank_balance: parseFloat(bankBalance.bank_balance),
            receivables: parseFloat(receivables.receivables),
            total: totalAssets,
          },
          liabilities: {
            payables: parseFloat(payables.payables),
            total: totalLiabilities,
          },
          equity: equity,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FinanceController();
