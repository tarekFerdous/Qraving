import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!serviceAccountJson) {
  throw new Error("Missing env var: FIREBASE_SERVICE_ACCOUNT_JSON — see .env.local.example");
}

const app = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
    });

export const adminDb = getFirestore(app);
