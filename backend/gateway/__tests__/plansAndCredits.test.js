import { PLANS } from "../../services/billing/config/plans.js";
import { decorateProxyReq } from "../utils/proxyWithHeaders.js";

describe("Billing & Credits Configuration", () => {
  it("defines valid free, starter, and pro plans with non-negative credits", () => {
    expect(PLANS).toHaveProperty("free");
    expect(PLANS).toHaveProperty("starter");
    expect(PLANS).toHaveProperty("pro");

    expect(PLANS.free.credits).toBeGreaterThanOrEqual(0);
    expect(PLANS.starter.credits).toBeGreaterThan(PLANS.free.credits);
    expect(PLANS.pro.credits).toBeGreaterThan(PLANS.starter.credits);
  });
});

describe("decorateProxyReq Header Sanitization", () => {
  it("deletes user-supplied identity headers to prevent header spoofing", () => {
    const proxyReqOpts = {
      headers: {
        "x-user-id": "attacker-id",
        "x-user-email": "attacker@fake.com",
        "x-user-avatar": "http://malicious.site/pic.png",
        "other-header": "value",
      },
    };
    const srcReq = {
      id: "req-123",
      correlationId: "corr-123",
    };

    const decorated = decorateProxyReq(proxyReqOpts, srcReq);

    // Spoofed headers must be deleted when srcReq.user is undefined
    expect(decorated.headers).not.toHaveProperty("x-user-id");
    expect(decorated.headers).not.toHaveProperty("x-user-email");
    expect(decorated.headers).not.toHaveProperty("x-user-avatar");
    expect(decorated.headers["x-request-id"]).toBe("req-123");
    expect(decorated.headers["x-correlation-id"]).toBe("corr-123");
  });

  it("injects verified session user identity headers when srcReq.user is present", () => {
    const proxyReqOpts = {
      headers: {
        "x-user-id": "attacker-id",
      },
    };
    const srcReq = {
      id: "req-456",
      correlationId: "corr-456",
      user: {
        userId: "verified-user-789",
        email: "verified@example.com",
        avatar: "http://example.com/photo.jpg",
      },
    };

    const decorated = decorateProxyReq(proxyReqOpts, srcReq);

    expect(decorated.headers["x-user-id"]).toBe("verified-user-789");
    expect(decorated.headers["x-user-email"]).toBe("verified@example.com");
    expect(decorated.headers["x-user-avatar"]).toBe("http://example.com/photo.jpg");
  });
});
