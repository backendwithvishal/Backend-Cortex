import dotenv from "dotenv";
import http from "http";
import app from "./app.js";
import { connectDB, disconnectDB } from "./shared/db/connectDB.js";
import redis from "./shared/redis/redis.js";
import rabbitMQ from "./shared/rabbitmq/rabbitmq.js";
import { gracefulShutdown } from "./shared/shutdown/gracefulShutdown.js";
import getLogger from "./shared/logging/logger.js";

dotenv.config();

const PORT = process.env.PORT || process.env.GATEWAY_PORT || 5000;
const SERVICE = "cortex-backend";
const logger = getLogger(SERVICE);

const server = http.createServer(app);

server.listen(PORT, async () => {
  try {
    await connectDB();
  } catch (err) {
    logger.error(`Database connection failed: ${err.message}`);
  }

  try {
    await rabbitMQ.connect();
  } catch (err) {
    logger.warn(`RabbitMQ connection skipped: ${err.message}`);
  }

  logger.info(`Cortex AI Unified Monolith running on port ${PORT}`);
});

gracefulShutdown(server, SERVICE, [
  async () => {
    logger.info("Closing MongoDB connection...");
    await disconnectDB();
  },
  async () => {
    logger.info("Closing Redis connection...");
    await redis.quit();
  },
  async () => {
    logger.info("Closing RabbitMQ connection...");
    await rabbitMQ.close();
  },
]);

export default server;
