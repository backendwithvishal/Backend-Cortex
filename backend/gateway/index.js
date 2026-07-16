import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import redis from "../shared/redis/redis.js";
import dotenv from "dotenv";
import proxy from "express-http-proxy";
import { proxyWithUser } from "./utils/proxyWithHeaders.js";
import { protect } from "./middlewares/auth.middleware.js";
import { getCurrentUser } from "./controllers/user.controller.js";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Request ID middleware
app.use((req, res, next) => {
  const reqId = req.headers["x-request-id"] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader("x-request-id", reqId);
  next();
});

// Logger Setup
morgan.token("id", (req) => req.id);
app.use(morgan('[:id] :method :url :status :res[content-length] - :response-time ms'));

// Security & Headers
app.use(helmet());
app.use(cookieParser());

// Dynamic CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : ["http://localhost:5173"];

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

// Serve uploads folder
app.use("/uploads", express.static("uploads"));

// Redis-backed rate limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || "300"), // Max 300 requests per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
  message: {
    success: false,
    message: "Too many requests, please try again later."
  }
});
app.use(globalLimiter);

// Health check endpoint (Gateway)
app.get("/health", async (req, res) => {
  try {
    const redisStatus = redis.status;
    res.status(200).json({
      success: true,
      service: "gateway",
      status: "healthy",
      redis: redisStatus,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      service: "gateway",
      status: "unhealthy",
      error: error.message
    });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({
    service: "gateway",
    status: "ok"
  });
});

// Proxy routes with error forwarding
app.use("/api/auth", proxy(process.env.AUTH_SERVICE, {
  proxyErrorHandler: (err, res, next) => next(err)
}));

app.use("/api/me", protect, getCurrentUser);
app.use("/api/chat", protect, proxyWithUser(process.env.CHAT_SERVICE));
app.use("/api/agent", protect, proxyWithUser(process.env.AGENT_SERVICE));
app.use("/api/billing", protect, proxyWithUser(process.env.BILLING_SERVICE));

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  const reqId = req.id || "unknown";
  console.error(`[Error] [Req ID: ${reqId}] ${err.message}`, err.stack);

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

app.listen(port, () => {
  console.log(`Gateway running on port ${port}`);
});
