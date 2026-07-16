import express from "express";
import {
  deductCredits,
  login,
  logout,
  updatePlan
} from "../controllers/auth.controllers.js";
import { protectInternal } from "../middlewares/internalAuth.js";

const router = express.Router();

router.post("/login", login);
router.get("/logout", logout);

router.patch("/internal/update-plan", protectInternal, updatePlan);
router.patch("/internal/deduct-credits", protectInternal, deductCredits);

export default router;