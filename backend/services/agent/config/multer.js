import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

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
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/**
 * Rejects any file that is neither a PDF nor an image based on MIME type.
 */
const fileFilter = (_req, file, cb) => {
  const allowed = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
  if (allowed) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files are accepted."));
  }
};

/**
 * Inspects file header magic bytes on disk to confirm content matches PDF or image.
 */
export const validateFileMagicBytes = async (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return;

  const handle = await fs.promises.open(filePath, "r");
  const buffer = Buffer.alloc(16);
  await handle.read(buffer, 0, 16, 0);
  await handle.close();

  const isPdf = buffer.toString("utf8", 0, 5) === "%PDF-";
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isGif =
    buffer.toString("utf8", 0, 6) === "GIF87a" || buffer.toString("utf8", 0, 6) === "GIF89a";
  const isWebp =
    buffer.toString("utf8", 0, 4) === "RIFF" && buffer.toString("utf8", 8, 12) === "WEBP";

  if (!isPdf && !isJpeg && !isPng && !isGif && !isWebp) {
    try {
      await fs.promises.unlink(filePath);
    } catch (_) {}
    const err = new Error(
      "Invalid file content: Magic bytes do not match expected PDF or image format."
    );
    err.status = 400;
    err.code = "INVALID_FILE_TYPE";
    throw err;
  }
};

export default multer({
  storage: diskStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});
