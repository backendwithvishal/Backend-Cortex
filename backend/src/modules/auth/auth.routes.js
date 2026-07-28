import express from "express";
import {
  deductCredits,
  getProfile,
  login,
  logout,
  refreshToken,
  updatePlan,
  updateProfile,
} from "./auth.controller.js";
import protect from "../../shared/middleware/auth.middleware.js";
import { protectInternal } from "../../shared/middleware/internalAuth.js";

const router = express.Router();

router.post("/login", login);
router.get("/logout", logout);
router.post("/refresh", refreshToken);
router.get("/profile", protect, getProfile);
router.patch("/profile", protect, updateProfile);

router.patch("/internal/update-plan", protectInternal, updatePlan);
router.patch("/internal/deduct-credits", protectInternal, deductCredits);

export default router;
