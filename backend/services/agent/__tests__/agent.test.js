import { chat, getFile, streamChat } from "../controllers/agent.controller.js";

describe("Agent Service — Controller Unit Tests", () => {
  let resMock;

  beforeEach(() => {
    resMock = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it("chat returns 400 if prompt, conversationId, or agent is missing", async () => {
    await chat({ body: {}, headers: { "x-user-id": "user-123" } }, resMock, jest.fn());
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_FIELDS" }),
    }));
  });

  it("chat returns 400 if x-user-id header is missing", async () => {
    await chat({ body: { prompt: "hi", conversationId: "c1", agent: "chat" }, headers: {} }, resMock, jest.fn());
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_USER_ID" }),
    }));
  });

  it("getFile returns 400 for path traversal filename attempts", async () => {
    await getFile({ params: { filename: "../secret.txt" }, query: {} }, resMock, jest.fn());
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "BAD_REQUEST" }),
    }));
  });

  it("streamChat returns 400 if required fields are missing", async () => {
    await streamChat({ body: {}, headers: { "x-user-id": "user-123" } }, resMock, jest.fn());
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_FIELDS" }),
    }));
  });
});
