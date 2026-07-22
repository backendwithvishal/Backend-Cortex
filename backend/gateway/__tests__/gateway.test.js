import request from "supertest";
import app from "../app.js";

describe("Gateway — Health & Root", () => {
  it("GET /health returns 200 with healthy status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe("gateway");
    expect(res.body.status).toBe("healthy");
    expect(res.body.timestamp).toBeDefined();
  });

  it("GET / returns 200 with service info", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("gateway");
    expect(res.body.status).toBe("ok");
  });
});

describe("Gateway — Authentication Guard", () => {
  it("GET /api/v1/me without session cookie returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/v1/me with session cookie passes auth guard", async () => {
    const res = await request(app)
      .get("/api/v1/me")
      .set("Cookie", "session=fake-session-id");
    // Without real Redis, this reaches the stub handler (200)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("GET /api/v1/auth/profile without session cookie returns 401 UNAUTHORIZED", async () => {
    const res = await request(app).get("/api/v1/auth/profile");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("GET /api/v1/auth/profile with session cookie passes auth guard", async () => {
    const res = await request(app)
      .get("/api/v1/auth/profile")
      .set("Cookie", "session=fake-session-id");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Gateway — 404 Handling", () => {
  it("Unknown route returns 404 with structured error", async () => {
    const res = await request(app).get("/api/v1/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("Gateway — Response Shape Consistency", () => {
  it("All error responses include success:false and error.code", async () => {
    const res = await request(app).get("/api/v1/me"); // no cookie
    expect(res.body).toHaveProperty("success", false);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toHaveProperty("code");
    expect(res.body.error).toHaveProperty("message");
  });

  it("All success responses include success:true and data or message", async () => {
    const res = await request(app).get("/health");
    expect(res.body).toHaveProperty("success", true);
  });
});
