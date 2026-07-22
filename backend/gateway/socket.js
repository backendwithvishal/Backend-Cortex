import { Server } from "socket.io";
import redis from "../shared/redis/redis.js";
import rabbitMQ from "../shared/rabbitmq/rabbitmq.js";

const parseCookies = (cookieString) => {
  if (!cookieString) return {};
  return Object.fromEntries(
    cookieString.split(";").map((c) => {
      const parts = c.trim().split("=");
      return [parts[0], parts.slice(1).join("=")];
    })
  );
};

let io;

export const initSocket = (server, allowedOrigins) => {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  // Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      const sessionId = cookies.session;

      if (!sessionId) {
        return next(new Error("Authentication required."));
      }

      const sessionData = await redis.get(`session:${sessionId}`);
      if (!sessionData) {
        return next(new Error("Session expired."));
      }

      socket.user = JSON.parse(sessionData);
      next();
    } catch (err) {
      return next(new Error("Authentication error: " + err.message));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.userId;
    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${userId})`);

    // Join private user room
    socket.join(`user:${userId}`);

    socket.on("join-conversation", async (conversationId) => {
      try {
        if (!conversationId) return;
        const chatServiceUrl = (process.env.CHAT_SERVICE || "http://localhost:5002").replace(
          /\/$/,
          ""
        );
        const res = await fetch(`${chatServiceUrl}/api/v1/chat/get-messages/${conversationId}`, {
          headers: {
            "x-internal-key": process.env.INTERNAL_API_KEY || "",
            "x-user-id": String(socket.user.userId),
          },
        });
        if (res.ok) {
          socket.join(`conversation:${conversationId}`);
          console.log(`[Socket.IO] Client ${socket.id} joined conversation:${conversationId}`);
        } else {
          socket.emit("error", { message: "Access denied to conversation." });
        }
      } catch (err) {
        socket.emit("error", { message: "Access denied to conversation." });
      }
    });

    socket.on("leave-conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`[Socket.IO] Client ${socket.id} left conversation:${conversationId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // Start RabbitMQ listeners to forward events to clients
  startRabbitMQForwarders();

  return io;
};

const startRabbitMQForwarders = async () => {
  try {
    // 1. Listen for billing payment verified events
    await rabbitMQ.consume("gateway.payment.verified", "billing.payment.verified", (data) => {
      const { userId, plan, credits } = data;
      console.log(`[Socket.IO Forwarder] Broadcasting payment.verified to user:${userId}`);
      io.to(`user:${userId}`).emit("payment.verified", { plan, credits });
    });
  } catch (error) {
    console.error(`[Socket.IO Forwarder] Error starting RabbitMQ consumers: ${error.message}`);
  }
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized.");
  }
  return io;
};
