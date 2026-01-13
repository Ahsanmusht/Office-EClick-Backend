require("dotenv").config();
const app = require("./src/app");
const { testConnection } = require("./src/config/database");
require("./src/jobs/scheduler");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await testConnection();
    console.log("Database connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
