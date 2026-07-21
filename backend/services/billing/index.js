import express from "express";
import dotenv from "dotenv";
import { connectDB, disconnectDB, getDBStatus } from "../../../shared/db/connectDB.js";
import { globalErrorHandler } from "../../../shared/response/response.js";
import { gracefulShutdown } from "../../../shared/shutdown/gracefulShutdown.js";
import rabbitMQ from "../../../shared/rabbitmq/rabbitmq.js";
import router from "./routes/billing.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5004;
const SERVICE = "billing";

app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  const dbStatus = getDBStatus();
  const isHealthy = dbStatus === "connected" && rabbitMQ.isConnected;

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: SERVICE,
    status: isHealthy ? "healthy" : "degraded",
    checks: {
      database: dbStatus,
      rabbitmq: rabbitMQ.isConnected ? "connected" : "disconnected",
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ service: SERVICE, status: "ok" });
});

app.use("/api/v1/billing", router);

// Global error handler (must be last)
app.use(globalErrorHandler(SERVICE));

const server = app.listen(PORT, async () => {
  await connectDB();
  try {
    await rabbitMQ.connect();
  } catch (err) {
    console.error(`[${SERVICE}] Failed to connect to RabbitMQ: ${err.message}`);
  }
  console.log(`[${SERVICE}] Service running on port ${PORT}`);
});

gracefulShutdown(server, SERVICE, [
  () => disconnectDB(),
  () => rabbitMQ.close(),
]);