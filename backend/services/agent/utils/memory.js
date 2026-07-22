import redis from "../../../shared/redis/redis.js";
import { getConversationHistory } from "./getConv.js";

const MEMORY_TTL_SECONDS = 86400; // 24 hours
const MAX_MEMORY_MESSAGES = 20; // rolling window

/**
 * Retrieves conversation history from Redis cache.
 * Falls back to the Chat service if the cache is cold, then warms it.
 *
 * @param {string} conversationId
 * @returns {Promise<Array<{ role: string, content: string }>>}
 */
export const getMemory = async (conversationId) => {
  const key = `conversation:${conversationId}`;
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const messages = await getConversationHistory(conversationId);
  await redis.set(key, JSON.stringify(messages), "EX", MEMORY_TTL_SECONDS);
  return messages;
};

/**
 * Appends a message to the in-memory conversation cache.
 * Enforces a rolling window of MAX_MEMORY_MESSAGES to prevent unbounded growth.
 *
 * @param {string} conversationId
 * @param {"user"|"assistant"} role
 * @param {string} content
 */
export const addMessage = async (conversationId, role, content) => {
  const key = `conversation:${conversationId}`;
  const existing = await redis.get(key);
  const messages = existing ? JSON.parse(existing) : [];

  messages.push({ role, content });

  // Enforce rolling window
  if (messages.length > MAX_MEMORY_MESSAGES) {
    messages.shift();
  }

  await redis.set(key, JSON.stringify(messages), "EX", MEMORY_TTL_SECONDS);
};
