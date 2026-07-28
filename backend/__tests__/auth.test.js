import { describe, it } from "node:test";
import assert from "node:assert";
import request from "supertest";
import app from "../src/app.js";

describe("Auth Module — Guards & Routes", () => {
  it("POST /api/v1/auth/login without token returns 400 MISSING_TOKEN", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, "MISSING_TOKEN");
  });

  it("GET /api/v1/auth/profile without session cookie returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/v1/auth/profile");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, "UNAUTHORIZED");
  });

  it("GET /api/v1/me without session cookie returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/v1/me");
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, "UNAUTHORIZED");
  });
});
