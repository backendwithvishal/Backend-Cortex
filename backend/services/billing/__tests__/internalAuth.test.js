import request from "supertest";
import app from "../app.js";

describe("Billing Service — Internal Auth Security", () => {
  const INTERNAL_KEY = "test-internal-secret";

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  test("rejects request missing x-internal-key with 403", async () => {
    const res = await request(app).post("/api/v1/billing/create-order").send({ plan: "starter" });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("allows request with valid x-internal-key to reach controller", async () => {
    const res = await request(app)
      .post("/api/v1/billing/create-order")
      .set("x-internal-key", INTERNAL_KEY)
      .send({});

    // Route reached, returns 400 MISSING_PLAN or missing fields
    expect(res.status).toBe(400);
  });
});
