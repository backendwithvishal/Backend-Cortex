import fs from "fs";
import path from "path";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

class LocalStorageProvider {
  constructor(storageDir) {
    this.storageDir = path.resolve(storageDir || "./storage/uploads");
    this.ensureDirectoryExists();
  }

  ensureDirectoryExists() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getSafePath(filename) {
    const safeName = path.basename(filename);
    const resolvedPath = path.resolve(this.storageDir, safeName);

    if (!resolvedPath.startsWith(this.storageDir)) {
      throw new Error("Access denied: Path traversal detected.");
    }
    return resolvedPath;
  }

  async saveFile(buffer, filename, mimetype) {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error("File size exceeds the limit of 20MB.");
    }

    if (!ALLOWED_MIME_TYPES.includes(mimetype) && !mimetype.startsWith("image/")) {
      throw new Error(`Invalid or unsupported file type: ${mimetype}`);
    }

    const targetPath = this.getSafePath(filename);
    await fs.promises.writeFile(targetPath, buffer);
    return filename;
  }

  async getFileStream(filename) {
    const filePath = this.getSafePath(filename);
    if (!fs.existsSync(filePath)) {
      const error = new Error("File not found");
      error.status = 404;
      throw error;
    }
    return fs.createReadStream(filePath);
  }

  async getDownloadUrl(filename) {
    const backendUrl = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/$/, "");
    return `${backendUrl}/api/v1/agent/files/${filename}`;
  }
}

class StorageService {
  constructor() {
    const providerType = process.env.STORAGE_PROVIDER || "local";

    if (providerType === "local") {
      const storagePath = process.env.STORAGE_PATH || "./storage/uploads";
      this.provider = new LocalStorageProvider(storagePath);
    } else {
      throw new Error(`Unsupported storage provider: ${providerType}`);
    }
  }

  async saveFile(buffer, filename, mimetype) {
    return this.provider.saveFile(buffer, filename, mimetype);
  }

  async getFileStream(filename) {
    return this.provider.getFileStream(filename);
  }

  async getDownloadUrl(filename) {
    return this.provider.getDownloadUrl(filename);
  }
}

export const storage = new StorageService();
export default storage;
