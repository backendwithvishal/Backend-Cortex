import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdSchema = z.string().regex(objectIdRegex, "Invalid ObjectId format");

export const updateConversationSchema = z.object({
  conversationId: objectIdSchema,
  title: z.string().min(1, "title is required").max(255, "title too long"),
});

export const deleteConversationSchema = z.object({
  id: objectIdSchema,
});

export const saveMessageSchema = z.object({
  conversationId: objectIdSchema,
  role: z.enum(["user", "assistant"], {
    errorMap: () => ({ message: "Role must be 'user' or 'assistant'" }),
  }),
  content: z.string().min(1, "content is required"),
  images: z.array(z.string()).optional().default([]),
  artifacts: z.array(z.any()).optional().default([]),
});

export const getMessagesParamsSchema = z.object({
  id: objectIdSchema,
});
