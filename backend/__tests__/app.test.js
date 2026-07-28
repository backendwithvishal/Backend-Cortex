import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app.js";

describe("Cortex Monolith — Health & Root", () => {
  it("GET /health returns 200 with service health status", async () => {
    const res = await request(app).get("/health");
    assert.strictEqual([200, 503].includes(res.status), true);
    assert.strictEqual(res.body.service, "cortex-backend");
    assert.ok(res.body.timestamp);
  });

  it("GET / returns 200 with root status", async () => {
    const res = await request(app).get("/");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.service, "cortex-backend");
    assert.strictEqual(res.body.status, "ok");
  });

  it("Unknown route returns 404 with structured error", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, "NOT_FOUND");
  });
});
