import dotenv from "dotenv";
import app from "./app.js";
import redis from "../../shared/redis/redis.js";
import { connectDB, disconnectDB } from "../../shared/db/connectDB.js";
import { gracefulShutdown } from "../../shared/shutdown/gracefulShutdown.js";
import rabbitMQ from "../../shared/rabbitmq/rabbitmq.js";
import { processPlanUpdate } from "./controllers/auth.controllers.js";

dotenv.config();

const PORT = process.env.PORT || 5001;
const SERVICE = "auth";

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
