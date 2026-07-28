import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.REDIS_URL) {
  console.warn("[Redis] REDIS_URL is not set. Falling back to redis://localhost:6379");
}

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  reconnectOnError: (err) => {
    console.error(`[Redis] Reconnecting due to error: ${err.message}`);
    return true;
  },
  retryStrategy: (times) => {
    if (times > 10) {
      console.error("[Redis] Max retry attempts reached. Giving up.");
      return null;
    }
    return Math.min(times * 100, 3000);
  },
});

redis.on("connect", () => {
  console.log("[Redis] Connected.");
});

redis.on("ready", () => {
  console.log("[Redis] Ready to accept commands.");
});

redis.on("error", (err) => {
  console.error(`[Redis] Error: ${err.message}`);
});

redis.on("close", () => {
  console.warn("[Redis] Connection closed.");
});

export default redis;
