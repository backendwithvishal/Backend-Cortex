import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.resolve("./temp");
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// Ensure temp upload directory exists at startup
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(_req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

/**
 * Rejects any file that is neither a PDF nor an image.
 */
const fileFilter = (_req, file, cb) => {
  const allowed = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
  if (allowed) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files are accepted."));
  }
};

export default multer({
  storage: diskStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});