import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: [true, "User ID is required"],
      index: true,
    },
    orderId: {
      type: String,
      required: [true, "Order ID is required"],
      unique: true,
      index: true,
    },
    paymentId: {
      type: String,
      default: "",
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
    },
    credits: {
      type: Number,
      required: [true, "Credits are required"],
      min: [0, "Credits cannot be negative"],
    },
    plan: {
      type: String,
      required: [true, "Plan name is required"],
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["created", "paid", "failed"],
      default: "created",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Payment", paymentSchema);
