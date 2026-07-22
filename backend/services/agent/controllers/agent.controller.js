import { graph } from "../graph/supervisor.graph.js";
import { addMessage } from "../utils/memory.js";
import { storage } from "../utils/storage.js";
import { sendError } from "../../../shared/response/response.js";
import { validateFileMagicBytes } from "../config/multer.js";
import axios from "axios";
import path from "path";

const CONTENT_TYPE_MAP = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/**
 * POST /api/v1/agent/chat
 * Runs an agent workflow for the given prompt and conversation.
 */
export const chat = async (req, res, next) => {
  try {
    const { prompt, conversationId, agent } = req.body;
    const userId = req.headers["x-user-id"];

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
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const internalHeaders = {
      "x-internal-key": process.env.INTERNAL_API_KEY,
      "x-user-id": userId,
      "x-correlation-id": req.headers["x-correlation-id"] || req.id || "",
    };

    // Persist user message to Redis memory and Chat service
    await addMessage(conversationId, "user", prompt);
    await axios.post(
      `${process.env.CHAT_SERVICE}/api/v1/chat/save-message`,
      { conversationId, role: "user", content: prompt },
      { headers: internalHeaders }
    );

    // Execute agent graph
    const result = await graph.invoke({
      prompt,
      conversationId,
      userId,
      agent,
      file: req.file,
    });

    const responseContent = result.response;
    const images = result.images || [];
    const artifacts = result.artifacts || [];

    // Persist assistant response to Redis memory and Chat service
    await addMessage(conversationId, "assistant", responseContent);
    await axios.post(
      `${process.env.CHAT_SERVICE}/api/v1/chat/save-message`,
      { conversationId, role: "assistant", content: responseContent, images, artifacts },
      { headers: internalHeaders }
    );

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

/**
 * GET /api/v1/agent/files/:filename
 * Streams a locally stored file to the client.
 */
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

/**
 * POST /api/v1/agent/stream
 * Streams agent response chunks in real-time via Server-Sent Events (SSE).
 */
export const streamChat = async (req, res, next) => {
  try {
    const { prompt, conversationId, agent } = req.body;
    const userId = req.headers["x-user-id"];

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
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const internalHeaders = {
      "x-internal-key": process.env.INTERNAL_API_KEY,
      "x-user-id": userId,
      "x-correlation-id": req.headers["x-correlation-id"] || req.id || "",
    };

    // Persist user prompt to Redis memory and Chat service
    await addMessage(conversationId, "user", prompt);
    await axios.post(
      `${process.env.CHAT_SERVICE}/api/v1/chat/save-message`,
      { conversationId, role: "user", content: prompt },
      { headers: internalHeaders }
    );

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.write(`data: ${JSON.stringify({ type: "start", agent })}\n\n`);

    const result = await graph.invoke({
      prompt,
      conversationId,
      userId,
      agent,
      file: req.file,
    });

    const responseContent = result.response;
    const images = result.images || [];
    const artifacts = result.artifacts || [];

    // Persist assistant completion to Redis memory and Chat service
    await addMessage(conversationId, "assistant", responseContent);
    await axios.post(
      `${process.env.CHAT_SERVICE}/api/v1/chat/save-message`,
      { conversationId, role: "assistant", content: responseContent, images, artifacts },
      { headers: internalHeaders }
    );

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
