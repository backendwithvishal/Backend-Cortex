/**
 * Testable Express application — does NOT start the HTTP server.
 * Import this in tests instead of index.js so supertest can bind to an
 * ephemeral port without conflicting with running instances.
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

const app = express();

app.use(helmet());
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "gateway",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Root info
app.get("/", (req, res) => {
  res.status(200).json({ service: "gateway", status: "ok" });
});

// Stub routes for testing middleware in isolation
app.get("/api/v1/me", (req, res) => {
  const sessionCookie = req.cookies?.session;
  if (!sessionCookie) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required." },
    });
  }
  res.status(200).json({ success: true, data: { user: { email: "test@example.com" } } });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found.` },
  });
});

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    error: { code: "INTERNAL_SERVER_ERROR", message: err.message },
  });
});

export default app;
