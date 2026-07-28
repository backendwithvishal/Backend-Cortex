import redis from "../redis/redis.js";
import { sendError } from "../response/response.js";

export const protect = async (req, res, next) => {
  try {
    const sessionId = req.cookies?.session;

    if (!sessionId) {
      return sendError(res, "Authentication required.", 401, "UNAUTHORIZED");
    }

    const sessionData = await redis.get(`session:${sessionId}`);

    if (!sessionData) {
      return sendError(res, "Session has expired. Please log in again.", 401, "SESSION_EXPIRED");
    }

    const user = JSON.parse(sessionData);
    req.user = user;
    req.headers["x-user-id"] = String(user.userId);

    next();
  } catch (error) {
    return sendError(res, error.message, 500);
  }
};

export default protect;
