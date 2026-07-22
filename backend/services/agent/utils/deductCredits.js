import axios from "axios";

/**
 * Calls the Auth service internal endpoint to deduct agent usage credits.
 * Throws a structured error with HTTP status and user-friendly message if
 * the user has insufficient credits or the request fails.
 *
 * @param {string} userId
 * @param {string} agent  — agent type key (e.g. "chat", "coding", "image")
 */
export const deductCredits = async (userId, agent) => {
  try {
    await axios.patch(
      `${process.env.AUTH_SERVICE}/api/v1/auth/internal/deduct-credits`,
      { userId, agent },
      {
        headers: {
          "x-internal-key": process.env.INTERNAL_API_KEY,
        },
      }
    );
  } catch (error) {
    const responseData = error.response?.data;

    const err = new Error(responseData?.message || "Failed to deduct credits.");
    err.status = error.response?.status || 500;
    err.data = {
      success: false,
      title: responseData?.title || "Insufficient Credits",
      message: responseData?.message || "You don't have enough credits. Please upgrade your plan.",
    };

    throw err;
  }
};
