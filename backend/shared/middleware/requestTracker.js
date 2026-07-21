import crypto from "crypto";
import { requestContext } from "../logging/context.js";

export const requestTrackerMiddleware = (req, res, next) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  const correlationId = req.headers["x-correlation-id"] || requestId;

  req.id = requestId;
  req.correlationId = correlationId;

  res.setHeader("x-request-id", requestId);
  res.setHeader("x-correlation-id", correlationId);

  const context = {
    requestId,
    correlationId,
    userId: req.headers["x-user-id"] || null,
  };

  requestContext.run(context, () => {
    next();
  });
};

export default requestTrackerMiddleware;
