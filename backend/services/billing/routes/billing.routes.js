import express from "express";
import { protectInternal } from "../../../shared/middleware/internalAuth.js";
import { validateRequest } from "../../../shared/validation/validate.js";
import { createOrderSchema, verifyPaymentSchema } from "../validation/billing.schema.js";
import { createOrder, verifyPayment } from "../controllers/billing.controller.js";

const router = express.Router();

router.use(protectInternal);

router.post("/create-order", validateRequest(createOrderSchema), createOrder);
router.post("/verify-payment", validateRequest(verifyPaymentSchema), verifyPayment);

export default router;
