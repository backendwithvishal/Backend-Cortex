import mongoose from "mongoose";

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
};

export const connectDB = async (uri) => {
  const mongoUri = uri || process.env.MONGODB_URL;

  if (!mongoUri) {
    throw new Error("MONGODB_URL environment variable is not set.");
  }

  try {
    await mongoose.connect(mongoUri, MONGO_OPTIONS);
    console.log(`[DB] MongoDB connected: ${mongoose.connection.host}`);
  } catch (error) {
    console.error(`[DB] Connection failed: ${error.message}`);
    process.exit(1);
  }

  mongoose.connection.on("error", (err) => {
    console.error(`[DB] Connection error: ${err.message}`);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[DB] MongoDB disconnected.");
  });
};

export const disconnectDB = async () => {
  await mongoose.connection.close();
  console.log("[DB] MongoDB connection closed.");
};

export const getDBStatus = () => {
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  return states[mongoose.connection.readyState] || "unknown";
};
