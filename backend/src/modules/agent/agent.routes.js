import express from "express";
import protect from "../../shared/middleware/auth.middleware.js";
import { chat, getFile, streamChat } from "./agent.controller.js";
import multer from "./config/multer.js";

const router = express.Router();

router.use(protect);

router.post("/chat", multer.single("file"), chat);
router.post("/stream", multer.single("file"), streamChat);
router.get("/files/:filename", getFile);

export default router;
