import express from "express";
import { protectInternal } from "../../../shared/middleware/internalAuth.js";
import { validateRequest } from "../../../shared/validation/validate.js";
import {
  updateConversationSchema,
  deleteConversationSchema,
  saveMessageSchema,
  getMessagesParamsSchema,
} from "../validation/chat.schema.js";
import {
  createConversation,
  getConversations,
  getMessages,
  saveMessage,
  updateConversation,
  deleteConversation,
} from "../controllers/chat.controller.js";

const router = express.Router();

router.use(protectInternal);

router.post("/create-conversation", createConversation);
router.get("/get-conversations", getConversations);
router.post("/update-conversation", validateRequest(updateConversationSchema), updateConversation);
router.delete(
  "/conversations/:id",
  validateRequest(deleteConversationSchema, "params"),
  deleteConversation
);
router.post("/save-message", validateRequest(saveMessageSchema), saveMessage);
router.get("/get-messages/:id", validateRequest(getMessagesParamsSchema, "params"), getMessages);

export default router;
