import axios from "axios";

export const getConversationHistory = async (conversationId) => {
  const response = await axios.get(
    `${process.env.CHAT_SERVICE}/get-messages/${conversationId}`
  );

  // Support both raw array formats and standardized JSON API response objects
  if (response.data && response.data.success && response.data.data) {
    return response.data.data.messages || [];
  }
  return response.data;
};