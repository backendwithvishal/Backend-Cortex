import axios from "axios";

/**
 * Fetches paginated message history for a conversation from the Chat service.
 * Returns a flat array of message objects: [{ role, content }, ...].
 */
export const getConversationHistory = async (conversationId) => {
  const response = await axios.get(
    `${process.env.CHAT_SERVICE}/api/v1/chat/get-messages/${conversationId}`,
    { params: { limit: 50 } }
  );

  const body = response.data;

  // Standardized paginated response shape: { success, data: { items, pagination } }
  if (body?.success && body?.data?.items) {
    return body.data.items.map((m) => ({ role: m.role, content: m.content }));
  }

  return [];
};
