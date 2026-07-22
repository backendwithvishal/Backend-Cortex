import { processPlanUpdate, deductCredits } from "../controllers/auth.controllers.js";

describe("Auth Service — Controller Unit Tests", () => {
  describe("processPlanUpdate Validation", () => {
    it("should throw error if required parameters are missing", async () => {
      await expect(processPlanUpdate(null, "pro", 100)).rejects.toThrow("userId, plan, and credits are required.");
      await expect(processPlanUpdate("user-123", null, 100)).rejects.toThrow("userId, plan, and credits are required.");
      await expect(processPlanUpdate("user-123", "pro", undefined)).rejects.toThrow("userId, plan, and credits are required.");
    });
  });

  describe("deductCredits Validation", () => {
    it("should return missing fields error if userId or agent missing", async () => {
      const resMock = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await deductCredits({ body: {} }, resMock);
      expect(resMock.status).toHaveBeenCalledWith(400);
      expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "MISSING_FIELDS" }),
      }));
    });
  });
});
