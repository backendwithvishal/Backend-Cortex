import express from "express";
import dotenv from "dotenv";
import redis from "../../shared/redis/redis.js";
import { getDBStatus } from "../../shared/db/connectDB.js";
import { globalErrorHandler } from "../../shared/response/response.js";
import { metricsMiddleware, getMetrics } from "../../shared/metrics/metrics.js";
import rabbitMQ from "../../shared/rabbitmq/rabbitmq.js";
import router from "./routes/auth.routes.js";

dotenv.config();

const app = express();
const SERVICE = "auth";

app.use(express.json());
app.use(metricsMiddleware);

app.get("/metrics", getMetrics(SERVICE));

// Health check
app.get("/health", async (req, res) => {
  const dbStatus = getDBStatus();
  const redisStatus = redis.status;
  const isHealthy = dbStatus === "connected" && redisStatus === "ready" && rabbitMQ.isConnected;

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: SERVICE,
    status: isHealthy ? "healthy" : "degraded",
    checks: {
      database: dbStatus,
      redis: redisStatus,
      rabbitmq: rabbitMQ.isConnected ? "connected" : "disconnected",
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ service: SERVICE, status: "ok" });
});

app.use("/api/v1/auth", router);

// Global error handler (must be last)
app.use(globalErrorHandler(SERVICE));

export default app;
