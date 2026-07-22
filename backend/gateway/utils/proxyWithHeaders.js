import proxy from "express-http-proxy";

/**
 * Creates an express-http-proxy middleware that forwards the authenticated
 * user context and tracing headers to the downstream service.
 *
 * Headers forwarded:
 *   x-user-id         — resolved userId from Redis session
 *   x-user-email      — user email
 *   x-user-avatar     — user avatar URL
 *   x-request-id      — unique request ID (set by requestTrackerMiddleware)
 *   x-correlation-id  — distributed trace correlation ID
 */
export const decorateProxyReq = (proxyReqOpts, srcReq) => {
  // Strip any client-supplied identity/security headers to prevent header spoofing
  delete proxyReqOpts.headers["x-user-id"];
  delete proxyReqOpts.headers["x-user-email"];
  delete proxyReqOpts.headers["x-user-avatar"];
  delete proxyReqOpts.headers["x-internal-key"];

  if (process.env.INTERNAL_API_KEY) {
    proxyReqOpts.headers["x-internal-key"] = process.env.INTERNAL_API_KEY;
  }

  if (srcReq.user) {
    proxyReqOpts.headers["x-user-id"] = String(srcReq.user.userId);
    proxyReqOpts.headers["x-user-email"] = srcReq.user.email;
    proxyReqOpts.headers["x-user-avatar"] = srcReq.user.avatar || "";
  }

  // Propagate tracing headers so downstream services share the same trace
  if (srcReq.id) proxyReqOpts.headers["x-request-id"] = srcReq.id;
  if (srcReq.correlationId) proxyReqOpts.headers["x-correlation-id"] = srcReq.correlationId;

  return proxyReqOpts;
};

export const proxyWithUser = (serviceUrl) => {
  return proxy(serviceUrl, {
    proxyReqOptDecorator: decorateProxyReq,
    proxyErrorHandler: (err, res, next) => {
      next(err);
    },
  });
};
