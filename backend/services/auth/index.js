import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import redis from "../../../shared/redis/redis.js";
import { connectDB, disconnectDB, getDBStatus } from "../../../shared/db/connectDB.js";
import { globalErrorHandler } from "../../../shared/response/response.js";
import { gracefulShutdown } from "../../../shared/shutdown/gracefulShutdown.js";
import rabbitMQ from "../../../shared/rabbitmq/rabbitmq.js";
import { processPlanUpdate } from "./controllers/auth.controllers.js";
import router from "./routes/auth.routes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const SERVICE = "auth";

app.use(express.json());

// Health check — checked by load balancers and Docker healthchecks
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

const server = app.listen(PORT, async () => {
  await connectDB();
  try {
    await rabbitMQ.connect();
    // Subscribe to billing updates
    await rabbitMQ.consume("auth.payment.verified", "billing.payment.verified", async (data) => {
      console.log(`[auth] Received billing.payment.verified event for user: ${data.userId}`);
      await processPlanUpdate(data.userId, data.plan, data.credits);
    });
  } catch (err) {
    console.error(`[${SERVICE}] Failed to connect or subscribe to RabbitMQ: ${err.message}`);
  }
  console.log(`[${SERVICE}] Service running on port ${PORT}`);
});

gracefulShutdown(server, SERVICE, [
  () => disconnectDB(),
  () => redis.quit(),
  () => rabbitMQ.close(),
]);
