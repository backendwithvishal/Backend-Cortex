import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import redis from "./shared/redis/redis.js";
import rabbitMQ from "./shared/rabbitmq/rabbitmq.js";
import getLogger from "./shared/logging/logger.js";
import { getDBStatus } from "./shared/db/connectDB.js";
import requestTrackerMiddleware from "./shared/middleware/requestTracker.js";
import { metricsMiddleware, getMetrics } from "./shared/metrics/metrics.js";
import { globalErrorHandler } from "./shared/response/response.js";
import protect from "./shared/middleware/auth.middleware.js";

import authRoutes from "./modules/auth/auth.routes.js";
import chatRoutes from "./modules/chat/chat.routes.js";
import agentRoutes from "./modules/agent/agent.routes.js";
import billingRoutes from "./modules/billing/billing.routes.js";

dotenv.config();

const app = express();
const SERVICE = "cortex-backend";
const logger = getLogger(SERVICE);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : ["http://localhost:5173"];

app.use(requestTrackerMiddleware);
app.use(metricsMiddleware);

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    });
  });
  next();
});

app.use(helmet());
app.use(compression());
app.use(cookieParser());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// Serve static uploads
app.use("/uploads", express.static("storage/uploads"));

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || "300"),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: "rl:global:",
  }),
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});
app.use(globalLimiter);

// Swagger Setup
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Cortex AI Modular Platform API",
      version: "1.0.0",
      description: "Production-grade unified microservices backend API documentation.",
    },
    servers: [
      {
        url: "http://localhost:5000/api/v1",
        description: "Unified Backend API Server",
      },
    ],
  },
  apis: ["./src/modules/**/*.routes.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Metrics & Health
app.get("/metrics", getMetrics(SERVICE));

app.get("/health", (req, res) => {
  const dbStatus = getDBStatus();
  const redisStatus = redis.status;
  const rabbitMQStatus = rabbitMQ.isConnected ? "connected" : "disconnected";
  const isHealthy = dbStatus === "connected" && redisStatus === "ready";

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: SERVICE,
    status: isHealthy ? "healthy" : "degraded",
    checks: {
      database: dbStatus,
      redis: redisStatus,
      rabbitmq: rabbitMQStatus,
    },
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ service: SERVICE, status: "ok" });
});

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/agent", agentRoutes);
app.use("/api/v1/billing", billingRoutes);

app.get("/api/v1/me", protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: "OK",
    data: { user: req.user },
  });
});

// Fallback 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found.`,
    },
  });
});

// Global Error Handler
app.use(globalErrorHandler(SERVICE));

export default app;
