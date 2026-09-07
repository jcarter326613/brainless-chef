import {
  createFirestoreDatabase,
  defineDatabaseMigrations,
} from "@brainless-chef/firestore-database";

const databaseId = process.env.FIRESTORE_DATABASE_ID;
if (!databaseId) {
  throw new Error("FIRESTORE_DATABASE_ID must be configured for database access.");
}

// Application collections and migrations belong here. The generic facade owns
// the Firestore client and enforces validation and write fencing internally.
const collections = {};
const migrations = defineDatabaseMigrations<typeof collections>([]);

export const database = createFirestoreDatabase({
  collections,
  databaseId,
  migrations,
});
