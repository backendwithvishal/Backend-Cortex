import crypto from "crypto";
import axios from "axios";
import razorpay from "../config/razorpay.js";
import { PLANS } from "../config/plans.js";
import Payment from "../models/payment.model.js";
import { sendSuccess, sendError } from "../../../shared/response/response.js";

// POST /create-order
export const createOrder = async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.headers["x-user-id"];

    if (!plan) {
      return sendError(res, "Plan is required.", 400, "MISSING_PLAN");
    }

    if (!userId) {
      return sendError(res, "User ID header is missing.", 400, "MISSING_USER_ID");
    }

    const selectedPlan = PLANS[plan];
    if (!selectedPlan) {
      return sendError(res, `Invalid plan: '${plan}'.`, 400, "INVALID_PLAN");
    }

    const order = await razorpay.orders.create({
      amount: selectedPlan.amount * 100, // Razorpay expects paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
    });

    await Payment.create({
      userId,
      orderId: order.id,
      amount: selectedPlan.amount,
      credits: selectedPlan.credits,
      plan: selectedPlan.id,
      currency: order.currency,
      status: "created",
    });

    return sendSuccess(res, { order, plan: selectedPlan }, "Order created successfully.", 201);
  } catch (error) {
    return sendError(res, error.message);
  }
};

// POST /verify-payment
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return sendError(
        res,
        "razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.",
        400,
        "MISSING_FIELDS"
      );
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return sendError(res, "Payment signature verification failed.", 400, "INVALID_SIGNATURE");
    }

    const payment = await Payment.findOne({ orderId: razorpay_order_id });
    if (!payment) {
      return sendError(res, "Payment record not found.", 404, "PAYMENT_NOT_FOUND");
    }

    if (payment.status === "paid") {
      return sendSuccess(res, null, "Payment already verified.");
    }

    payment.status = "paid";
    payment.paymentId = razorpay_payment_id;
    await payment.save();

    // Notify auth service to update user's plan and credits
    await axios.patch(
      `${process.env.AUTH_SERVICE}/internal/update-plan`,
      {
        userId: payment.userId,
        plan: payment.plan,
        credits: payment.credits,
      },
      {
        headers: {
          "x-internal-key": process.env.INTERNAL_API_KEY,
        },
      }
    );

    return sendSuccess(res, null, "Payment verified and plan updated successfully.");
  } catch (error) {
    return sendError(res, error.message);
  }
};