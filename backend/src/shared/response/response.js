export const sendSuccess = (res, data, message = "OK", statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (res, message, statusCode = 500, code = "INTERNAL_SERVER_ERROR") => {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

export const globalErrorHandler = (serviceName = "cortex-backend") => {
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
