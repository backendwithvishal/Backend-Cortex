import express from "express";
import dotenv from "dotenv";
import { getDBStatus } from "../../shared/db/connectDB.js";
import { globalErrorHandler } from "../../shared/response/response.js";
import { metricsMiddleware, getMetrics } from "../../shared/metrics/metrics.js";
import router from "./routes/chat.routes.js";

dotenv.config();

const app = express();
const SERVICE = "chat";

app.use(express.json());
app.use(metricsMiddleware);

app.get("/metrics", getMetrics(SERVICE));

// Health check
app.get("/health", (req, res) => {
  const dbStatus = getDBStatus();
  const isHealthy = dbStatus === "connected";

  return res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: SERVICE,
    status: isHealthy ? "healthy" : "degraded",
    checks: {
      database: dbStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ service: SERVICE, status: "ok" });
});

app.use("/api/v1/chat", router);

// Global error handler (must be last)
app.use(globalErrorHandler(SERVICE));

export default app;
