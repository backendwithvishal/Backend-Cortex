import express from "express";
import dotenv from "dotenv";
import { getDBStatus } from "../../shared/db/connectDB.js";
import { metricsMiddleware, getMetrics } from "../../shared/metrics/metrics.js";
import rabbitMQ from "../../shared/rabbitmq/rabbitmq.js";
import router from "./routes/agent.route.js";

dotenv.config();

const app = express();
const SERVICE = "agent";

app.use(express.json());
app.use(metricsMiddleware);

app.get("/metrics", getMetrics(SERVICE));

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

// Global error handler
app.use((err, req, res, _next) => {
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

export default app;
