import { protectInternal } from "../../shared/middleware/internalAuth.js";
import { jest } from "@jest/globals";

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("protectInternal middleware", () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = process.env.INTERNAL_API_KEY;
  });

  afterAll(() => {
    process.env.INTERNAL_API_KEY = originalEnv;
  });

  it("returns 500 if INTERNAL_API_KEY is not set on the server", () => {
    delete process.env.INTERNAL_API_KEY;
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    protectInternal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining("Internal API key is not configured"),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 if internal key header does not match", () => {
    process.env.INTERNAL_API_KEY = "super-secret-key";
    const req = { headers: { "x-internal-key": "wrong-key" } };
    const res = mockRes();
    const next = jest.fn();

    protectInternal(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining("Forbidden"),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() if internal key header matches exactly", () => {
    process.env.INTERNAL_API_KEY = "super-secret-key";
    const req = { headers: { "x-internal-key": "super-secret-key" } };
    const res = mockRes();
    const next = jest.fn();

    protectInternal(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
