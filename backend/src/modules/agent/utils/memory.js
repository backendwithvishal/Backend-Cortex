import redis from "../../../shared/redis/redis.js";
import Message from "../../chat/message.model.js";

const MEMORY_TTL_SECONDS = 86400; // 24 hours
const MAX_MEMORY_MESSAGES = 20; // rolling window

export const getMemory = async (conversationId) => {
  const key = `conversation:${conversationId}`;
  const cached = await redis.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const messagesDocs = await Message.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(50);

  const messages = messagesDocs.map((m) => ({ role: m.role, content: m.content }));
  await redis.set(key, JSON.stringify(messages), "EX", MEMORY_TTL_SECONDS);
  return messages;
};

export const addMessage = async (conversationId, role, content) => {
  const key = `conversation:${conversationId}`;
  const existing = await redis.get(key);
  const messages = existing ? JSON.parse(existing) : [];

  messages.push({ role, content });

  if (messages.length > MAX_MEMORY_MESSAGES) {
    messages.shift();
  }

  await redis.set(key, JSON.stringify(messages), "EX", MEMORY_TTL_SECONDS);
};
