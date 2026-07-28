import express from "express";
import protect from "../../shared/middleware/auth.middleware.js";
import { validateRequest } from "../../shared/validation/validate.js";
import { createOrderSchema, verifyPaymentSchema } from "./billing.schema.js";
import { createOrder, verifyPayment } from "./billing.controller.js";

const router = express.Router();

router.use(protect);

router.post("/create-order", validateRequest(createOrderSchema), createOrder);
router.post("/verify-payment", validateRequest(verifyPaymentSchema), verifyPayment);

export default router;
