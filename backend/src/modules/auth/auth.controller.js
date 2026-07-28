import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import User from "./user.model.js";
import redis from "../../shared/redis/redis.js";
import firebaseApp from "../../config/firebase.js";
import { sendSuccess, sendError } from "../../shared/response/response.js";
import { CREDIT_COSTS } from "../../config/creditCosts.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const buildSessionPayload = (user) => ({
  userId: user._id,
  email: user.email,
  avatar: user.avatar,
  name: user.name,
  plan: user.plan,
  credits: user.credits,
  totalCredits: user.totalCredits,
});

export const refreshSession = async (user) => {
  const sessionId = await redis.get(`user-session:${user._id}`);
  if (!sessionId) return;

  await redis.set(
    `session:${sessionId}`,
    JSON.stringify(buildSessionPayload(user)),
    "EX",
    SESSION_TTL_SECONDS
  );
};

// POST /login
export const login = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return sendError(res, "Firebase ID token is required.", 400, "MISSING_TOKEN");
    }

    if (!firebaseApp) {
      return sendError(res, "Firebase Admin SDK is not configured on the server.", 500, "FIREBASE_NOT_CONFIGURED");
    }

    const decoded = await getAuth(firebaseApp).verifyIdToken(token);

    let user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      user = await User.create({
        firebaseUid: decoded.uid,
        email: decoded.email,
        name: decoded.name || decoded.email.split("@")[0],
        avatar: decoded.picture || "",
        provider: decoded.firebase?.sign_in_provider || "password",
      });
    }

    const sessionId = crypto.randomUUID();

    await redis.set(`user-session:${user._id}`, sessionId, "EX", SESSION_TTL_SECONDS);
    await redis.set(
      `session:${sessionId}`,
      JSON.stringify(buildSessionPayload(user)),
      "EX",
      SESSION_TTL_SECONDS
    );

    res.cookie("session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: SESSION_TTL_SECONDS * 1000,
    });

    return sendSuccess(res, { user }, "Logged in successfully.", 200);
  } catch (error) {
    if (error.code === "auth/argument-error" || error.code === "auth/id-token-expired") {
      return sendError(res, "Invalid or expired Firebase token.", 401, "INVALID_TOKEN");
    }
    return sendError(res, error.message, 500);
  }
};

// GET /logout
export const logout = async (req, res) => {
  try {
    const sessionId = req.cookies?.session;

    if (sessionId) {
      const sessionDataRaw = await redis.get(`session:${sessionId}`);
      if (sessionDataRaw) {
        const sessionData = JSON.parse(sessionDataRaw);
        await redis.del(`user-session:${sessionData.userId}`);
      }
      await redis.del(`session:${sessionId}`);
    }

    res.clearCookie("session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    });

    return sendSuccess(res, null, "Logged out successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};

// POST /refresh
export const refreshToken = async (req, res) => {
  try {
    const sessionId = req.cookies?.session;
    if (!sessionId) {
      return sendError(res, "No active session found.", 401, "UNAUTHORIZED");
    }

    const sessionDataRaw = await redis.get(`session:${sessionId}`);
    if (!sessionDataRaw) {
      return sendError(res, "Session expired or invalid.", 401, "SESSION_EXPIRED");
    }

    const sessionData = JSON.parse(sessionDataRaw);
    const user = await User.findById(sessionData.userId);
    if (!user) {
      return sendError(res, "User not found.", 404, "USER_NOT_FOUND");
    }

    await refreshSession(user);

    return sendSuccess(res, { user }, "Session refreshed successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};

// GET /profile
export const getProfile = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || req.user?.userId;
    if (!userId) {
      return sendError(res, "User ID is missing.", 400, "MISSING_USER_ID");
    }

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found.", 404, "USER_NOT_FOUND");
    }

    return sendSuccess(res, { user });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// PATCH /profile
export const updateProfile = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] || req.user?.userId;
    if (!userId) {
      return sendError(res, "User ID is missing.", 400, "MISSING_USER_ID");
    }

    const { name, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (avatar !== undefined) updates.avatar = avatar.trim();

    const user = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true });

    if (!user) {
      return sendError(res, "User not found.", 404, "USER_NOT_FOUND");
    }

    await refreshSession(user);
    return sendSuccess(res, { user }, "Profile updated successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};

// Internal / helper: update user plan and credits
export const processPlanUpdate = async (userId, plan, credits) => {
  if (!userId || !plan || credits === undefined) {
    const err = new Error("userId, plan, and credits are required.");
    err.status = 400;
    err.code = "MISSING_FIELDS";
    throw err;
  }

  const planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: { plan, planExpiresAt },
      $inc: { credits: credits, totalCredits: credits },
    },
    { new: true, runValidators: true }
  );

  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  await refreshSession(user);
  return user;
};

// PATCH /internal/update-plan
export const updatePlan = async (req, res) => {
  try {
    const { userId, plan, credits } = req.body;
    await processPlanUpdate(userId, plan, credits);
    return sendSuccess(res, null, "Plan updated successfully.");
  } catch (error) {
    return sendError(
      res,
      error.message,
      error.status || 500,
      error.code || "INTERNAL_SERVER_ERROR"
    );
  }
};

// Internal / helper: deduct credits directly
export const processCreditDeduction = async (userId, agent) => {
  if (!userId || !agent) {
    const err = new Error("userId and agent are required.");
    err.status = 400;
    err.code = "MISSING_FIELDS";
    throw err;
  }

  const requiredCredits = CREDIT_COSTS[agent] ?? 1;

  const user = await User.findOneAndUpdate(
    { _id: userId, credits: { $gte: requiredCredits } },
    { $inc: { credits: -requiredCredits } },
    { new: true }
  );

  if (!user) {
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      const err = new Error("User not found.");
      err.status = 404;
      err.code = "USER_NOT_FOUND";
      throw err;
    }
    const err = new Error("Insufficient credits. Please upgrade your plan.");
    err.status = 400;
    err.code = "INSUFFICIENT_CREDITS";
    throw err;
  }

  await refreshSession(user);
  return user;
};

// PATCH /internal/deduct-credits
export const deductCredits = async (req, res) => {
  try {
    const { userId, agent } = req.body;
    const user = await processCreditDeduction(userId, agent);
    return sendSuccess(res, { credits: user.credits }, "Credits deducted successfully.");
  } catch (error) {
    return sendError(
      res,
      error.message,
      error.status || 500,
      error.code || "INTERNAL_SERVER_ERROR"
    );
  }
};
