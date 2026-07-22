import {
  createConversation,
  deleteConversation,
  updateConversation,
  getMessages,
} from "../controllers/chat.controller.js";

describe("Chat Service — Controller Unit Tests", () => {
  let resMock;

  beforeEach(() => {
    resMock = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  it("createConversation returns 400 if x-user-id header is missing", async () => {
    await createConversation({ headers: {} }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_USER_ID" }),
    }));
  });

  it("deleteConversation returns 400 for invalid ObjectId format", async () => {
    await deleteConversation({ params: { id: "invalid-id" }, headers: { "x-user-id": "user-1" } }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "INVALID_ID" }),
    }));
  });

  it("updateConversation returns 400 if conversationId or title missing", async () => {
    await updateConversation({ body: {}, headers: { "x-user-id": "user-1" } }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "MISSING_FIELDS" }),
    }));
  });

  it("getMessages returns 400 for invalid conversation ObjectId", async () => {
    await getMessages({ params: { id: "bad-id" }, query: {}, headers: {} }, resMock);
    expect(resMock.status).toHaveBeenCalledWith(400);
    expect(resMock.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: "INVALID_ID" }),
    }));
  });
});
