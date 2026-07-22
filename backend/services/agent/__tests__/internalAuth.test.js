import { jest } from "@jest/globals";
import request from "supertest";

// Mock controller functions to avoid loading heavy graph/LLM modules during route middleware tests
jest.unstable_mockModule("../controllers/agent.controller.js", () => ({
  chat: (req, res) => res.status(200).json({ success: true }),
  streamChat: (req, res) => res.status(200).json({ success: true }),
  getFile: (req, res) => {
    if (req.params.filename === "nonexistent.pdf") {
      return res.status(404).json({ success: false, error: { message: "File not found." } });
    }
    return res.status(200).json({ success: true });
  },
}));

const { default: app } = await import("../app.js");

describe("Agent Service — Internal Auth Security", () => {
  const INTERNAL_KEY = "test-internal-secret";

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  test("rejects request missing x-internal-key with 403", async () => {
    const res = await request(app).get("/api/v1/agent/files/sample.pdf");

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("allows request with valid x-internal-key to reach router controller", async () => {
    const res = await request(app)
      .get("/api/v1/agent/files/nonexistent.pdf")
      .set("x-internal-key", INTERNAL_KEY);

    expect(res.status).toBe(404);
  });
});
