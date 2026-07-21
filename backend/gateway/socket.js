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

    socket.on("join-conversation", (conversationId) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`[Socket.IO] Client ${socket.id} joined conversation:${conversationId}`);
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

    // 2. Listen for agent streaming/response events
    await rabbitMQ.consume("gateway.agent.stream", "agent.stream.token", (data) => {
      const { conversationId, chunk } = data;
      console.log(`[Socket.IO Forwarder] Broadcasting agent token chunk to conversation:${conversationId}`);
      io.to(`conversation:${conversationId}`).emit("agent.chunk", chunk);
    });

    // 3. Listen for general notifications
    await rabbitMQ.consume("gateway.notification", "notification.created", (data) => {
      const { userId, message, type } = data;
      console.log(`[Socket.IO Forwarder] Broadcasting notification to user:${userId}`);
      io.to(`user:${userId}`).emit("notification", { message, type });
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
