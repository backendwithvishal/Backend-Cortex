import { sendSuccess, sendError, sendPaginated } from "../../shared/response/response.js";

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("sendSuccess", () => {
  it("returns 200 with success:true and data", () => {
    const res = mockRes();
    sendSuccess(res, { id: 1 }, "Created", 201);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: "Created",
        data: { id: 1 },
      })
    );
  });

  it("defaults to statusCode 200 and message OK", () => {
    const res = mockRes();
    sendSuccess(res, null);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: "OK" })
    );
  });
});

describe("sendError", () => {
  it("returns 500 with success:false and error shape", () => {
    const res = mockRes();
    sendError(res, "Something went wrong");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong",
        }),
      })
    );
  });

  it("accepts custom statusCode and error code", () => {
    const res = mockRes();
    sendError(res, "Not found", 404, "NOT_FOUND");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: "NOT_FOUND" }),
      })
    );
  });
});

describe("sendPaginated", () => {
  it("returns pagination metadata with items", () => {
    const res = mockRes();
    const items = [{ id: 1 }, { id: 2 }];
    sendPaginated(res, items, 50, 2, 10);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          items,
          pagination: expect.objectContaining({
            total: 50,
            page: 2,
            limit: 10,
            totalPages: 5,
            hasNextPage: true,
            hasPrevPage: true,
          }),
        }),
      })
    );
  });

  it("correctly computes hasNextPage and hasPrevPage for first page", () => {
    const res = mockRes();
    sendPaginated(res, [], 5, 1, 10);
    const call = res.json.mock.calls[0][0];
    expect(call.data.pagination.hasPrevPage).toBe(false);
    expect(call.data.pagination.hasNextPage).toBe(false); // 1 page total
  });
});
