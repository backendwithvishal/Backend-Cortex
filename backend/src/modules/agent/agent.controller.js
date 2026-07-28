import { graph } from "./graph/supervisor.graph.js";
import { addMessage } from "./utils/memory.js";
import { storage } from "./utils/storage.js";
import { sendError } from "../../shared/response/response.js";
import { validateFileMagicBytes } from "./config/multer.js";
import { saveMessageInternal } from "../chat/chat.controller.js";
import path from "path";

const CONTENT_TYPE_MAP = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// POST /api/v1/agent/chat
export const chat = async (req, res, next) => {
  try {
    const { prompt, conversationId, agent } = req.body;
    const userId = req.headers["x-user-id"] || req.user?.userId;

    if (req.file) {
      await validateFileMagicBytes(req.file.path);
    }

    if (!prompt || !conversationId || !agent) {
      return sendError(
        res,
        "prompt, conversationId, and agent are required.",
        400,
        "MISSING_FIELDS"
      );
    }

    if (!userId) {
      return sendError(res, "User ID is missing.", 400, "MISSING_USER_ID");
    }

    // Persist user prompt to Redis memory and MongoDB
    await addMessage(conversationId, "user", prompt);
    await saveMessageInternal({ conversationId, userId, role: "user", content: prompt });

    // Run LangGraph agent workflow
    const result = await graph.invoke({
      prompt,
      conversationId,
      userId: String(userId),
      agent,
      file: req.file,
    });

    const responseContent = result.response;
    const images = result.images || [];
    const artifacts = result.artifacts || [];

    // Persist assistant response to Redis memory and MongoDB
    await addMessage(conversationId, "assistant", responseContent);
    await saveMessageInternal({
      conversationId,
      userId,
      role: "assistant",
      content: responseContent,
      images,
      artifacts,
    });

    return res.status(200).json({
      success: true,
      answer: responseContent,
      images,
      artifacts,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/agent/files/:filename
export const getFile = async (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!filename || filename.includes("/") || filename.includes("\\")) {
      return sendError(res, "Invalid file name.", 400, "BAD_REQUEST");
    }

    const fileStream = await storage.getFileStream(filename);
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPE_MAP[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);

    if (req.query.download === "true") {
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    }

    fileStream.pipe(res);
  } catch (error) {
    if (error.status === 404) {
      return sendError(res, "File not found.", 404, "NOT_FOUND");
    }
    next(error);
  }
};

// POST /api/v1/agent/stream (SSE)
export const streamChat = async (req, res, next) => {
  try {
    const { prompt, conversationId, agent } = req.body;
    const userId = req.headers["x-user-id"] || req.user?.userId;

    if (req.file) {
      await validateFileMagicBytes(req.file.path);
    }

    if (!prompt || !conversationId || !agent) {
      return sendError(
        res,
        "prompt, conversationId, and agent are required.",
        400,
        "MISSING_FIELDS"
      );
    }

    if (!userId) {
      return sendError(res, "User ID is missing.", 400, "MISSING_USER_ID");
    }

    await addMessage(conversationId, "user", prompt);
    await saveMessageInternal({ conversationId, userId, role: "user", content: prompt });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "start", agent })}\n\n`);

    const result = await graph.invoke({
      prompt,
      conversationId,
      userId: String(userId),
      agent,
      file: req.file,
    });

    const responseContent = result.response;
    const images = result.images || [];
    const artifacts = result.artifacts || [];

    await addMessage(conversationId, "assistant", responseContent);
    await saveMessageInternal({
      conversationId,
      userId,
      role: "assistant",
      content: responseContent,
      images,
      artifacts,
    });

    res.write(`data: ${JSON.stringify({ type: "chunk", content: responseContent })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "end", images, artifacts })}\n\n`);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      next(error);
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`);
      res.end();
    }
  }
};
