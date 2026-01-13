const cron = require("node-cron");
const { executeQuery } = require("../config/database");
const SalaryController = require("../controllers/SalaryController");

// Run daily at 00:00
cron.schedule("0 0 * * *", async () => {
  console.log("Running scheduled jobs...");

  try {
    // Process recurring expenses
    await SalaryController.processRecurringExpenses();
    console.log("Recurring expenses processed");

    // Check stock alerts
    const NotificationController =
      require("../controllers/NotificationController").NotificationController;
    await NotificationController.checkAndCreateStockAlerts();
    console.log("Stock alerts checked");
  } catch (error) {
    console.error("Scheduled job error:", error);
  }
});

module.exports = cron;
