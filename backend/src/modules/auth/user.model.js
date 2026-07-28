import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    firebaseUid: {
      type: String,
      required: [true, "Firebase UID is required"],
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      index: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    provider: {
      type: String,
      default: "password",
    },
    plan: {
      type: String,
      required: true,
      enum: ["free", "starter", "pro", "basic", "premium"],
      default: "free",
    },
    credits: {
      type: Number,
      required: true,
      min: [0, "Credits cannot be negative"],
      default: 100,
    },
    totalCredits: {
      type: Number,
      required: true,
      min: [0, "Total credits cannot be negative"],
      default: 100,
    },
    planExpiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
export default User;
