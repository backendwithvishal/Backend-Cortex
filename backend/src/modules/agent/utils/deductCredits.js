import { processCreditDeduction } from "../../auth/auth.controller.js";

export const deductCredits = async (userId, agent) => {
  try {
    await processCreditDeduction(userId, agent);
  } catch (error) {
    const err = new Error(error.message || "Failed to deduct credits.");
    err.status = error.status || 500;
    err.data = {
      success: false,
      title: "Insufficient Credits",
      message: error.message || "You don't have enough credits. Please upgrade your plan.",
    };
    throw err;
  }
};
