import dotenv from "dotenv";
import app from "./app.js";
import { connectDB, disconnectDB } from "../../shared/db/connectDB.js";
import { gracefulShutdown } from "../../shared/shutdown/gracefulShutdown.js";

dotenv.config();

const PORT = process.env.PORT || 5002;
const SERVICE = "chat";

const server = app.listen(PORT, async () => {
  await connectDB();
  console.log(`[${SERVICE}] Service running on port ${PORT}`);
});

gracefulShutdown(server, SERVICE, [() => disconnectDB()]);
