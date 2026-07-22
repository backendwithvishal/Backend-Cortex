export const getCurrentUser = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "OK",
    data: { user: req.user },
  });
};
