import crypto from "crypto";
import { getAuth } from "firebase-admin/auth";
import User from "../models/user.model.js";
import redis from "../../../shared/redis/redis.js";
import { app as firebaseApp } from "../config/firebase.js";
import { sendSuccess, sendError } from "../../../shared/response/response.js";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Builds the session payload stored in Redis.
 * Keeping this as a dedicated function ensures all session writers produce
 * identical shapes and prevents drift between login / updatePlan / deductCredits.
 */
const buildSessionPayload = (user) => ({
  userId: user._id,
  email: user.email,
  avatar: user.avatar,
  name: user.name,
  plan: user.plan,
  credits: user.credits,
  totalCredits: user.totalCredits,
});

/**
 * Refreshes the Redis session for a user if an active session exists.
 * Used after any operation that mutates credits or plan or profile details.
 */
const refreshSession = async (user) => {
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

    // Store reverse lookup: userId → sessionId (allows session invalidation on plan change)
    await redis.set(
      `user-session:${user._id}`,
      sessionId,
      "EX",
      SESSION_TTL_SECONDS
    );

    // Store session data: sessionId → user payload
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

// POST /refresh  (refreshes current active session)
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

// GET /profile  (fetches current user details from DB)
export const getProfile = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
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

// PATCH /profile  (updates user name or avatar)
export const updateProfile = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const { name, avatar } = req.body;
    const updates = {};
    if (name) updates.name = name.trim();
    if (avatar !== undefined) updates.avatar = avatar.trim();

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return sendError(res, "User not found.", 404, "USER_NOT_FOUND");
    }

    await refreshSession(user);
    return sendSuccess(res, { user }, "Profile updated successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};

// Helper to update user plan and credits, shared by HTTP controllers and RabbitMQ consumers
export const processPlanUpdate = async (userId, plan, credits) => {
  if (!userId || !plan || credits === undefined) {
    const err = new Error("userId, plan, and credits are required.");
    err.status = 400;
    err.code = "MISSING_FIELDS";
    throw err;
  }

  const user = await User.findById(userId);
  if (!user) {
    const err = new Error("User not found.");
    err.status = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  user.plan = plan;
  user.credits += credits;
  user.totalCredits += credits;
  user.planExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await user.save();
  await refreshSession(user);
  return user;
};

// PATCH /internal/update-plan  (called by billing service after successful payment)
export const updatePlan = async (req, res) => {
  try {
    const { userId, plan, credits } = req.body;
    await processPlanUpdate(userId, plan, credits);
    return sendSuccess(res, null, "Plan updated successfully.");
  } catch (error) {
    return sendError(res, error.message, error.status || 500, error.code || "INTERNAL_SERVER_ERROR");
  }
};

// PATCH /internal/deduct-credits  (called by agent service before processing)
export const deductCredits = async (req, res) => {
  try {
    const { userId, agent } = req.body;

    if (!userId || !agent) {
      return sendError(res, "userId and agent are required.", 400, "MISSING_FIELDS");
    }

    const CREDIT_COSTS = {
      chat: 1,
      search: 5,
      coding: 10,
      pdf: 10,
      ppt: 10,
      image: 10,
    };

    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, "User not found.", 404, "USER_NOT_FOUND");
    }

    const requiredCredits = CREDIT_COSTS[agent] ?? 1;

    if (user.credits < requiredCredits) {
      return sendError(
        res,
        "Insufficient credits. Please upgrade your plan.",
        400,
        "INSUFFICIENT_CREDITS"
      );
    }

    user.credits -= requiredCredits;
    await user.save();
    await refreshSession(user);

    return sendSuccess(res, { credits: user.credits }, "Credits deducted successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};