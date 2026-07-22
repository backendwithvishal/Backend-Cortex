/**
 * Sends a standardized success response.
 * @param {import('express').Response} res
 * @param {object|Array} data - The response payload.
 * @param {string} [message] - Optional success message.
 * @param {number} [statusCode=200] - HTTP status code.
 */
export const sendSuccess = (res, data, message = "OK", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Sends a standardized error response.
 * @param {import('express').Response} res
 * @param {string} message - User-facing error message.
 * @param {number} [statusCode=500] - HTTP status code.
 * @param {string} [code] - Optional machine-readable error code.
 */
export const sendError = (res, message, statusCode = 500, code = "INTERNAL_SERVER_ERROR") => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

/**
 * Creates a standardized global error-handling Express middleware.
 * @param {string} serviceName - Name of the microservice (for logging).
 */
export const globalErrorHandler = (serviceName = "service") => {
  return (err, req, res, _next) => {
    const reqId = req.id || "n/a";
    console.error(`[${serviceName}] [Error] [Req: ${reqId}] ${err.message}`, err.stack);

    const statusCode = err.status || err.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || "INTERNAL_SERVER_ERROR",
        message: err.message || "An unexpected error occurred.",
        ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
      },
    });
  };
};

/**
 * Creates a standardized paginated response.
 * @param {import('express').Response} res
 * @param {Array} items
 * @param {number} total
 * @param {number} page
 * @param {number} limit
 */
export const sendPaginated = (res, items, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return res.status(200).json({
    success: true,
    data: {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
  });
};
