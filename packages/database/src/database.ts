import {
  createFirestoreDatabase,
} from "firestore-database";

const databaseId = process.env.FIRESTORE_DATABASE_ID;
if (!databaseId) {
  throw new Error("FIRESTORE_DATABASE_ID must be configured for database access.");
}

// Application collections and optional storage migrations belong here. The generic facade owns
// the Firestore client and validation internally.
const collections = {};

export const database = createFirestoreDatabase({
  collections,
  databaseId,
});
