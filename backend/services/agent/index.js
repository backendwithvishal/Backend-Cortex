import express from "express";
import dotenv from "dotenv";
import { connectDB, disconnectDB, getDBStatus } from "../../../shared/db/connectDB.js";
import { gracefulShutdown } from "../../../shared/shutdown/gracefulShutdown.js";
import rabbitMQ from "../../../shared/rabbitmq/rabbitmq.js";
import router from "./routes/agent.route.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5003;
const SERVICE = "agent";

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

app.use("/api/v1/agent", router);

// Global error handler — preserves structured errors thrown by agent workflow
app.use((err, req, res, next) => {
  console.error(`[${SERVICE}] [Error] ${err.message}`, err.stack);

  // Agent-level structured errors (e.g. insufficient credits)
  if (err.status && err.data) {
    return res.status(err.status).json(err.data);
  }

  return res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred.",
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    },
  });
});

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
