import express from "express";
import { chat, getFile } from "../controllers/agent.controller.js";
import multer from "../config/multer.js";

const router = express.Router();

router.post(
 "/chat",
 multer.single("file"),
 chat
);

router.get(
  "/files/:filename",
  getFile
);

export default router;