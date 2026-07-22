import { sendError } from "../response/response.js";

/**
 * Validates request data against a Zod schema.
 * Formats errors to preserve the standard response shape:
 * { success: false, error: { code: "VALIDATION_ERROR", message: "..." } }
 */
export const validateRequest = (schema, source = "body") => {
  return (req, res, next) => {
    const dataToValidate =
      source === "params" ? req.params : source === "query" ? req.query : req.body;
    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue
        ? `${issue.path.join(".") || "field"}: ${issue.message}`
        : "Validation failed.";
      return sendError(res, message, 400, "VALIDATION_ERROR");
    }

    req[source] = result.data;
    next();
  };
};

export const validateData = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue
      ? `${issue.path.join(".") || "field"}: ${issue.message}`
      : "Validation failed.";
    const err = new Error(message);
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  return result.data;
};
