import redis from "../../../shared/redis/redis.js";

/** Per-agent request limits per user per minute */
const LIMITS = {
  chat:   20,
  coding:  5,
  pdf:     5,
  ppt:     5,
  image:   3,
  search:  5,
};

const WINDOW_SECONDS = 60;

/**
 * Checks whether the user has exceeded their per-agent rate limit.
 * Uses a Redis counter with a 60-second sliding window.
 *
 * Throws a structured 429 error if the limit is exceeded.
 *
 * @param {string} userId
 * @param {string} agent
 * @returns {Promise<{ remaining: number, limit: number }>}
 */
export const checkAgentLimit = async (userId, agent) => {
  const max = LIMITS[agent] ?? LIMITS.chat;
  const key = `rate:${agent}:${userId}`;

  const count = await redis.incr(key);

  // Set expiry only on the first increment
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }

  if (count > max) {
    const ttl = await redis.ttl(key);
    const minutes = Math.floor(ttl / 60);
    const seconds = ttl % 60;
    const retryAfter = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    const error = new Error(`Rate limit exceeded for ${agent}.`);
    error.status = 429;
    error.data = {
      success: false,
      agent,
      limit: max,
      remainingTime: ttl,
      retryAfter,
      message: `You have reached the ${agent} limit (${max} requests/minute). Try again in ${retryAfter}.`,
    };

    throw error;
  }

  return { remaining: max - count, limit: max };
};