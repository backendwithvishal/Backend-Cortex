import { createOrder, verifyPayment } from "../controllers/billing.controller.js";

describe("Billing Service — Controller Unit Tests", () => {
  let resMock;

  beforeEach(() => {
    resMock = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it("createOrder returns 400 if plan is missing", async () => {
    await createOrder({ body: {}, headers: { "x-user-id": "user-123" } }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_PLAN" }),
    }));
  });

  it("createOrder returns 400 if x-user-id is missing", async () => {
    await createOrder({ body: { plan: "pro" }, headers: {} }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_USER_ID" }),
    }));
  });

  it("createOrder returns 400 for invalid plan name", async () => {
    await createOrder({ body: { plan: "non-existent-plan" }, headers: { "x-user-id": "user-123" } }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "INVALID_PLAN" }),
    }));
  });

  it("verifyPayment returns 400 if required Razorpay parameters are missing", async () => {
    await verifyPayment({ body: {} }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_FIELDS" }),
    }));
  });

  it("verifyPayment returns 400 for invalid HMAC signature", async () => {
    const reqMock = {
      body: {
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_123",
        razorpay_signature: "invalid_sig",
      },
    };
    await verifyPayment(reqMock, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "INVALID_SIGNATURE" }),
    }));
  });
});
