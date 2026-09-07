import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const fakeFirestore = vi.hoisted(() => {
  const documents = new Map<string, unknown>();
  const reference = (collectionPath: string, id: string) => {
    const key = `${collectionPath}/${id}`;
    return {
      get: async () => ({
        data: () => documents.get(key),
        exists: documents.has(key),
        id,
      }),
      id,
      key,
    };
  };

  const firestore = {
    collection: (collectionPath: string) => ({
      doc: (id: string) => reference(collectionPath, id),
    }),
    runTransaction: async <Result>(
      operation: (transaction: {
        create: (ref: { key: string }, data: unknown) => void;
        delete: (ref: { key: string }) => void;
        get: (ref: { get: () => Promise<unknown> }) => Promise<unknown>;
        set: (ref: { key: string }, data: unknown) => void;
      }) => Promise<Result>,
    ): Promise<Result> =>
      operation({
        create(ref, data) {
          if (documents.has(ref.key)) {
            throw new Error("already exists");
          }
          documents.set(ref.key, data);
        },
        delete(ref) {
          documents.delete(ref.key);
        },
        get: (ref) => ref.get(),
        set(ref, data) {
          documents.set(ref.key, data);
        },
      }),
  };

  return { documents, firestore };
});

vi.mock("firebase-admin/app", () => ({
  applicationDefault: () => ({}),
  getApps: () => [],
  initializeApp: () => ({}),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldPath: { documentId: () => "__name__" },
  FieldValue: {
    delete: () => ({ type: "delete" }),
    increment: (value: number) => ({ type: "increment", value }),
    serverTimestamp: () => ({ type: "serverTimestamp" }),
  },
  Timestamp: class Timestamp {},
  getFirestore: () => fakeFirestore.firestore,
}));

import {
  createFirestoreDatabase,
  defineCollection,
  DocumentValidationError,
} from "../src/index.js";
import { registryFingerprint } from "../src/registry.js";

const collections = {
  examples: defineCollection({
    path: "examples",
    schema: z.object({ name: z.string().min(1) }).strict(),
  }),
};

function database() {
  return createFirestoreDatabase({
    collections,
    databaseId: "test",
    migrations: [],
  });
}

describe("Firestore database facade", () => {
  it("validates writes before entering a transaction", async () => {
    fakeFirestore.documents.clear();

    await expect(
      database().collections.examples.set("example", { name: "" }),
    ).rejects.toBeInstanceOf(DocumentValidationError);
  });

  it("automatically guards writes against an outdated migration ledger", async () => {
    fakeFirestore.documents.clear();

    await expect(
      database().collections.examples.set("example", { name: "Example" }),
    ).rejects.toThrow("Database writes are blocked");
  });

  it("writes and reads typed documents after the facade verifies the ledger", async () => {
    fakeFirestore.documents.clear();
    fakeFirestore.documents.set("__firestore_migrations/state", {
      migrationInProgress: null,
      registryFingerprint: registryFingerprint([]),
    });
    const connection = database();

    await connection.collections.examples.create("example", { name: "Example" });

    await expect(connection.collections.examples.get("example")).resolves.toEqual({
      data: { name: "Example" },
      id: "example",
    });
  });

  it("reuses the original schema for a second facade targeting the same database", () => {
    const original = database();
    const permissive = createFirestoreDatabase({
      collections: {
        examples: defineCollection({
          path: "examples",
          schema: z.object({ name: z.string() }).passthrough(),
        }),
      },
      databaseId: "test",
      migrations: [],
    });

    expect(permissive).toBe(original);
  });
});
