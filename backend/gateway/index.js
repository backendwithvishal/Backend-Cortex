import express from "express";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import proxy from "express-http-proxy";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

import redis from "../shared/redis/redis.js";
import rabbitMQ from "../shared/rabbitmq/rabbitmq.js";
import getLogger from "../shared/logging/logger.js";
import requestTrackerMiddleware from "../shared/middleware/requestTracker.js";
import { metricsMiddleware, getMetrics } from "../shared/metrics/metrics.js";
import { gracefulShutdown } from "../shared/shutdown/gracefulShutdown.js";
import { protect } from "./middlewares/auth.middleware.js";
import { getCurrentUser } from "./controllers/user.controller.js";
import { proxyWithUser } from "./utils/proxyWithHeaders.js";
import { initSocket } from "./socket.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 5000;
const SERVICE = "gateway";
const logger = getLogger(SERVICE);

// Allowed origins setup
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : ["http://localhost:5173"];

// Initialize Socket.IO
initSocket(server, allowedOrigins);

// Middleware Pipeline
app.use(requestTrackerMiddleware);
app.use(metricsMiddleware);

// Winston Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: duration
    });
  });
  next();
});

// Helmet Configuration
app.use(helmet());
app.use(cookieParser());

// Dynamic CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());

// Serve static uploads
app.use("/uploads", express.static("uploads"));

// CSRF Protection Middleware
const csrfProtection = (req, res, next) => {
  const sessionCookie = req.cookies?.session;
  
  if (sessionCookie && ["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const csrfToken = req.headers["x-csrf-token"] || req.query._csrf;
    const expectedToken = crypto
      .createHmac("sha256", process.env.INTERNAL_API_KEY || "csrf-fallback-secret")
      .update(sessionCookie)
      .digest("hex");

    if (!csrfToken || csrfToken !== expectedToken) {
      logger.warn(`CSRF validation failed for session ${sessionCookie.slice(0, 8)}...`);
      return res.status(403).json({
        success: false,
        error: { code: "CSRF_ERROR", message: "Invalid or missing CSRF token." }
      });
    }
  }

  // Generate and set token for client
  if (sessionCookie) {
    const nextToken = crypto
      .createHmac("sha256", process.env.INTERNAL_API_KEY || "csrf-fallback-secret")
      .update(sessionCookie)
      .digest("hex");
    res.setHeader("x-csrf-token", nextToken);
  }
  next();
};

app.use(csrfProtection);

// Global redis-backed rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "300"),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: "rl:global:"
  }),
  message: {
    success: false,
    message: "Too many requests, please try again later."
  }
});
app.use(globalLimiter);

// Specific Auth login endpoint rate limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 login requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: "rl:login:"
  }),
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes."
  }
});

// Swagger Documentation Setup
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Cortex AI Platform API",
      version: "1.0.0",
      description: "API Documentation for the production-grade Cortex AI microservices.",
    },
    servers: [
      {
        url: "http://localhost:5000/api/v1",
        description: "API Gateway"
      }
    ],
    components: {
      securitySchemes: {
        SessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "session"
        }
      }
    }
  },
  apis: [
    "./gateway/index.js",
    "./gateway/routes/*.js",
    "./services/auth/routes/*.routes.js",
    "./services/chat/routes/*.routes.js",
    "./services/agent/routes/*.route.js",
    "./services/billing/routes/*.routes.js"
  ]
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health Checks & Metrics
app.get("/metrics", getMetrics(SERVICE));

app.get("/health", async (req, res) => {
  const redisStatus = redis.status;
  const rabbitMQStatus = rabbitMQ.isConnected ? "connected" : "disconnected";
  const isHealthy = redisStatus === "ready" && rabbitMQ.isConnected;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    service: SERVICE,
    status: isHealthy ? "healthy" : "degraded",
    checks: {
      redis: redisStatus,
      rabbitmq: rabbitMQStatus,
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ service: SERVICE, status: "ok" });
});

// Proxy routes under version /api/v1/
app.use("/api/v1/auth/login", loginLimiter, proxy(process.env.AUTH_SERVICE, {
  proxyReqPathResolver: () => "/api/v1/auth/login",
  proxyErrorHandler: (err, res, next) => next(err)
}));

app.use("/api/v1/auth", proxy(process.env.AUTH_SERVICE, {
  proxyReqPathResolver: (req) => `/api/v1/auth${req.url}`,
  proxyErrorHandler: (err, res, next) => next(err)
}));

app.use("/api/v1/me", protect, getCurrentUser);
app.use("/api/v1/chat", protect, proxyWithUser(process.env.CHAT_SERVICE));
app.use("/api/v1/agent", protect, proxyWithUser(process.env.AGENT_SERVICE));
app.use("/api/v1/billing", protect, proxyWithUser(process.env.BILLING_SERVICE));

// Fallback 404 Route
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} not found.`
    }
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  const reqId = req.id || "unknown";
  logger.error(`[Req ID: ${reqId}] ${err.message}`, err);

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred",
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack })
    }
  });
});

// Bind server and listen
server.listen(port, async () => {
  try {
    await rabbitMQ.connect();
  } catch (err) {
    logger.error(`Failed to connect to RabbitMQ: ${err.message}`);
  }
  logger.info(`Gateway service running on port ${port}`);
});

// Graceful Shutdown
gracefulShutdown(server, SERVICE, [
  async () => {
    logger.info("Closing Redis connection...");
    await redis.quit();
  },
  async () => {
    logger.info("Closing RabbitMQ connection...");
    await rabbitMQ.close();
  }
]);
export default app;
