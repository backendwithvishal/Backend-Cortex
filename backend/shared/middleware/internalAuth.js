export const protectInternal = (req, res, next) => {
  const internalKey = req.headers["x-internal-key"];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      success: false,
      message: "Internal API key is not configured on the server."
    });
  }

  if (internalKey !== expectedKey) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Invalid internal API key."
    });
  }

  next();
};
