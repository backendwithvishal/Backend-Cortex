import { jest } from "@jest/globals";
import request from "supertest";

// Mock Redis
jest.unstable_mockModule("../../../shared/redis/redis.js", () => ({
  default: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    status: "ready",
  },
}));

// Mock Firebase Admin
jest.unstable_mockModule("../config/firebase.js", () => ({
  app: {},
}));

jest.unstable_mockModule("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: jest.fn(),
  }),
}));

// Mock User model
jest.unstable_mockModule("../models/user.model.js", () => ({
  default: {
    findOneAndUpdate: jest.fn(),
    exists: jest.fn(),
    findById: jest.fn(),
  },
}));

const { default: User } = await import("../models/user.model.js");
const { default: app } = await import("../app.js");

describe("Auth Service — Atomic Credit Deduction", () => {
  const INTERNAL_KEY = "test-internal-secret";
  const userId = "507f1f77bcf86cd799439011";

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects request missing x-internal-key with 403", async () => {
    const res = await request(app)
      .patch("/api/v1/auth/internal/deduct-credits")
      .send({ userId, agent: "coding" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("fires two concurrent deductCredits calls; first succeeds and second gets INSUFFICIENT_CREDITS", async () => {
    let callCount = 0;

    // Simulate atomic MongoDB update: first call succeeds, second fails because credits < 10
    User.findOneAndUpdate.mockImplementation(async (_filter, _update) => {
      callCount++;
      if (callCount === 1) {
        return { _id: userId, credits: 0, totalCredits: 10 };
      }
      return null;
    });

    User.exists.mockResolvedValue({ _id: userId });

    const req1 = request(app)
      .patch("/api/v1/auth/internal/deduct-credits")
      .set("x-internal-key", INTERNAL_KEY)
      .send({ userId, agent: "coding" });

    const req2 = request(app)
      .patch("/api/v1/auth/internal/deduct-credits")
      .set("x-internal-key", INTERNAL_KEY)
      .send({ userId, agent: "coding" });

    const [res1, res2] = await Promise.all([req1, req2]);

    const successRes = res1.status === 200 ? res1 : res2;
    const failedRes = res1.status === 200 ? res2 : res1;

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.credits).toBe(0);

    expect(failedRes.status).toBe(400);
    expect(failedRes.body.success).toBe(false);
    expect(failedRes.body.error.code).toBe("INSUFFICIENT_CREDITS");
  });
});
