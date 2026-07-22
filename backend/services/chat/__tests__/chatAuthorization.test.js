import { jest } from "@jest/globals";
import request from "supertest";

// Mock Mongoose models before importing app
jest.unstable_mockModule("../models/conversation.model.js", () => ({
  default: {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/message.model.js", () => ({
  default: {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  },
}));

const { default: Conversation } = await import("../models/conversation.model.js");
const { default: Message } = await import("../models/message.model.js");
const { default: app } = await import("../app.js");

describe("Chat Service Authorization & Object-Level Security", () => {
  const INTERNAL_KEY = "test-internal-secret";
  const userA = "user-111";
  const userB = "user-222";
  const validConvId = "60c72b2f9b1d8b2b8c8b4567";

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects request missing x-internal-key with 403", async () => {
    const res = await request(app).get("/api/v1/chat/get-conversations").set("x-user-id", userA);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("User A can create a conversation successfully", async () => {
    Conversation.create.mockResolvedValue({
      _id: validConvId,
      userId: userA,
      title: "New Chat",
    });

    const res = await request(app)
      .post("/api/v1/chat/create-conversation")
      .set("x-internal-key", INTERNAL_KEY)
      .set("x-user-id", userA);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(Conversation.create).toHaveBeenCalledWith({ userId: userA });
  });

  test("User B cannot fetch messages of User A's conversation (returns 404)", async () => {
    // Conversation belongs to userA, so query by userB returns null
    Conversation.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/chat/get-messages/${validConvId}`)
      .set("x-internal-key", INTERNAL_KEY)
      .set("x-user-id", userB);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(Conversation.findOne).toHaveBeenCalledWith({
      _id: validConvId,
      userId: userB,
      deletedAt: null,
    });
    expect(Message.find).not.toHaveBeenCalled();
  });

  test("User B cannot update title of User A's conversation (returns 404)", async () => {
    Conversation.findOneAndUpdate.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/chat/update-conversation")
      .set("x-internal-key", INTERNAL_KEY)
      .set("x-user-id", userB)
      .send({ conversationId: validConvId, title: "Hacked Title" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(Conversation.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: validConvId, userId: userB, deletedAt: null },
      { title: "Hacked Title" },
      { new: true, runValidators: true }
    );
  });

  test("User B cannot delete User A's conversation (returns 404)", async () => {
    Conversation.findOneAndUpdate.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/chat/conversations/${validConvId}`)
      .set("x-internal-key", INTERNAL_KEY)
      .set("x-user-id", userB);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(Conversation.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: validConvId, userId: userB, deletedAt: null },
      { deletedAt: expect.any(Date) },
      { new: true }
    );
  });

  test("User B cannot save message to User A's conversation (returns 404)", async () => {
    Conversation.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/chat/save-message")
      .set("x-internal-key", INTERNAL_KEY)
      .set("x-user-id", userB)
      .send({ conversationId: validConvId, role: "user", content: "Hello" });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(Message.create).not.toHaveBeenCalled();
  });
});
