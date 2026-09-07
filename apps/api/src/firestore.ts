import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const databaseId = process.env.FIRESTORE_DATABASE_ID;

if (!databaseId) {
  throw new Error("FIRESTORE_DATABASE_ID must be configured for the API service.");
}

const app =
  getApps()[0] ?? initializeApp({ credential: applicationDefault() });

// Cloud Run supplies Application Default Credentials for the API runtime identity.
export const firestore = getFirestore(app, databaseId);
