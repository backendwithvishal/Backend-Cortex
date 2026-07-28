import { initializeApp, cert } from "firebase-admin/app";
import fs from "fs";
import path from "path";

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (e) {
    console.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON env var.");
  }
}

if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
  try {
    const jsonStr = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString("utf8");
    serviceAccount = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64 env var.");
  }
}

if (!serviceAccount) {
  const defaultPath = path.resolve(process.cwd(), "serviceAccount.json");
  if (fs.existsSync(defaultPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
  }
}

export const firebaseApp = serviceAccount
  ? initializeApp({ credential: cert(serviceAccount) })
  : null;

export default firebaseApp;
