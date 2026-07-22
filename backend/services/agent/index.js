import dotenv from "dotenv";
import app from "./app.js";
import { connectDB, disconnectDB } from "../../shared/db/connectDB.js";
import { gracefulShutdown } from "../../shared/shutdown/gracefulShutdown.js";
import rabbitMQ from "../../shared/rabbitmq/rabbitmq.js";

dotenv.config();

const PORT = process.env.PORT || 5003;
const SERVICE = "agent";

const server = app.listen(PORT, async () => {
  await connectDB();
  try {
    await rabbitMQ.connect();
  } catch (err) {
    console.error(`[${SERVICE}] Failed to connect to RabbitMQ: ${err.message}`);
  }
  console.log(`[${SERVICE}] Service running on port ${PORT}`);
});

gracefulShutdown(server, SERVICE, [() => disconnectDB(), () => rabbitMQ.close()]);
