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

// GET /get-conversations?search=abc&sort=asc&page=1&limit=20
export const getConversations = async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const search = req.query.search || "";
    const sortOrder = req.query.sort === "asc" ? 1 : -1;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || DEFAULT_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    const filter = {
      userId,
      deletedAt: null,
      ...(search && { title: { $regex: search, $options: "i" } }),
    };

    const [conversations, total] = await Promise.all([
      Conversation.find(filter).sort({ updatedAt: sortOrder }).skip(skip).limit(limit),
      Conversation.countDocuments(filter),
    ]);

    return sendPaginated(res, conversations, total, page, limit);
  } catch (error) {
    return sendError(res, error.message);
  }
};

// DELETE /conversations/:id
export const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers["x-user-id"];

    if (!id || !isValidObjectId(id)) {
      return sendError(res, "Valid conversation ID is required.", 400, "INVALID_ID");
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      { deletedAt: new Date() },
      { new: true }
    );

    if (!conversation) {
      return sendError(res, "Conversation not found or already deleted.", 404, "NOT_FOUND");
    }

    return sendSuccess(res, { conversationId: id }, "Conversation deleted successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};

// POST /update-conversation
export const updateConversation = async (req, res) => {
  try {
    const { conversationId, title } = req.body;
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    if (!conversationId || !title) {
      return sendError(res, "conversationId and title are required.", 400, "MISSING_FIELDS");
    }

    if (!isValidObjectId(conversationId)) {
      return sendError(res, "Invalid conversation ID.", 400, "INVALID_ID");
    }

    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, userId, deletedAt: null },
      { title },
      { new: true, runValidators: true }
    );

    if (!conversation) {
      return sendError(res, "Conversation not found or access denied.", 404, "NOT_FOUND");
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
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    if (!conversationId || !role || !content) {
      return sendError(
        res,
        "conversationId, role, and content are required.",
        400,
        "MISSING_FIELDS"
      );
    }

    if (!isValidObjectId(conversationId)) {
      return sendError(res, "Invalid conversation ID.", 400, "INVALID_ID");
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
      deletedAt: null,
    });
    if (!conversation) {
      return sendError(res, "Conversation not found or access denied.", 404, "NOT_FOUND");
    }

    const message = await Message.create({
      conversationId,
      userId,
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
    const userId = req.headers["x-user-id"];
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || DEFAULT_PAGE_LIMIT);
    const skip = (page - 1) * limit;

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    if (!isValidObjectId(conversationId)) {
      return sendError(res, "Invalid conversation ID.", 400, "INVALID_ID");
    }

    const conversation = await Conversation.findOne({
      _id: conversationId,
      userId,
      deletedAt: null,
    });
    if (!conversation) {
      return sendError(res, "Conversation not found or access denied.", 404, "NOT_FOUND");
    }

    const filter = { conversationId, userId };
    const [messages, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: 1 }).skip(skip).limit(limit),
      Message.countDocuments(filter),
    ]);

    return sendPaginated(res, messages, total, page, limit);
  } catch (error) {
    return sendError(res, error.message);
  }
};
