import redis from "../../shared/redis/redis.js";

export const protect = async (req, res, next) => {
  try {
    const sessionId = req.cookies?.session;

    if (!sessionId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      });
    }

    const sessionData = await redis.get(`session:${sessionId}`);

    if (!sessionData) {
      return res.status(401).json({
        success: false,
        error: { code: "SESSION_EXPIRED", message: "Session has expired. Please log in again." },
      });
    }

    req.user = JSON.parse(sessionData);
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: error.message },
    });
  }
};
