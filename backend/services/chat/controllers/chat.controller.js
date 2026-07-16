import mongoose from "mongoose";
import Conversation from "../models/conversation.model.js";
import Message from "../models/message.model.js";
import { sendSuccess, sendError, sendPaginated } from "../../../shared/response/response.js";

const DEFAULT_PAGE_LIMIT = 30;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST /create-conversation
export const createConversation = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const conversation = await Conversation.create({ userId });
    return sendSuccess(res, { conversation }, "Conversation created.", 201);
  } catch (error) {
    return sendError(res, error.message);
  }
};

// GET /get-conversations
export const getConversations = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const conversations = await Conversation.find({
      userId,
      deletedAt: null,
    }).sort({ updatedAt: -1 });

    return sendSuccess(res, { conversations });
  } catch (error) {
    return sendError(res, error.message);
  }
};

// POST /update-conversation
export const updateConversation = async (req, res) => {
  try {
    const { conversationId, title } = req.body;

    if (!conversationId || !title) {
      return sendError(res, "conversationId and title are required.", 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(conversationId)) {
      return sendError(res, "Invalid conversation ID.", 400, "INVALID_ID");
    }

    const conversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { title },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      return sendError(res, "Conversation not found.", 404, "NOT_FOUND");
    }

    return sendSuccess(res, { conversation }, "Conversation updated.");
  } catch (error) {
    return sendError(res, error.message);
  }
};

// POST /save-message
export const saveMessage = async (req, res) => {
  try {
    const { conversationId, role, content, images, artifacts } = req.body;

    if (!conversationId || !role || !content) {
      return sendError(res, "conversationId, role, and content are required.", 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(conversationId)) {
      return sendError(res, "Invalid conversation ID.", 400, "INVALID_ID");
    }

    const message = await Message.create({
      conversationId,
      role,
      content,
      images: images || [],
      artifacts: artifacts || [],
    });

    return sendSuccess(res, { message }, "Message saved.", 201);
  } catch (error) {
    return sendError(res, error.message);
  }
};

// GET /get-messages/:id?page=1&limit=30
export const getMessages = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || DEFAULT_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    if (!isValidObjectId(conversationId)) {
      return sendError(res, "Invalid conversation ID.", 400, "INVALID_ID");
    }

    const [messages, total] = await Promise.all([
      Message.find({ conversationId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversationId }),
    ]);

    return sendPaginated(res, messages, total, page, limit);
  } catch (error) {
    return sendError(res, error.message);
  }
};