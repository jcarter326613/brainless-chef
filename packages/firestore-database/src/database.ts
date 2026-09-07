import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
  type WhereFilterOp,
} from "firebase-admin/firestore";
import { z } from "zod";

import { assertMigrationsCurrent, assertMigrationsCurrentInTransaction } from "./status.js";
import { defineMigrations } from "./registry.js";
import { runMigrations } from "./runner.js";
import type {
  BackfillMutation,
  FirestoreMigration,
  MigrationRunResult,
} from "./types.js";

export class DocumentValidationError extends Error {
  readonly collectionPath: string;
  readonly documentId: string;
  readonly cause: z.ZodError;

  constructor(
    collectionPath: string,
    documentId: string,
    cause: z.ZodError,
  ) {
    super(
      `Document "${collectionPath}/${documentId}" does not match its current schema: ${cause.message}`,
    );
    this.name = "DocumentValidationError";
    this.collectionPath = collectionPath;
    this.documentId = documentId;
    this.cause = cause;
  }
}

export interface CollectionDefinition<Schema extends z.ZodType = z.ZodType> {
  path: string;
  schema: Schema;
}

export function defineCollection<Schema extends z.ZodType>(
  definition: CollectionDefinition<Schema>,
): CollectionDefinition<Schema> {
  if (!definition.path || definition.path.includes("/")) {
    throw new Error("Collection paths must be a single, non-empty collection ID.");
  }

  return Object.freeze({ ...definition });
}

type CollectionDefinitions = Record<string, CollectionDefinition>;
type DocumentFor<Definition extends CollectionDefinition> = z.output<
  Definition["schema"]
> extends object
  ? z.output<Definition["schema"]>
  : never;

export type CollectionDocument<Definition extends CollectionDefinition> =
  DocumentFor<Definition>;

export interface StoredDocument<T> {
  data: T;
  id: string;
}

type FieldName<T> = Extract<keyof T, string>;

export type QueryFilter<T> = {
  [Field in FieldName<T>]: {
    field: Field;
    operator: WhereFilterOp;
    value: T[Field];
  };
}[FieldName<T>];

export interface QueryOrder<T> {
  direction?: "asc" | "desc";
  field: FieldName<T>;
}

export interface QueryOptions<T> {
  limit?: number;
  orderBy?: readonly QueryOrder<T>[];
  where?: readonly QueryFilter<T>[];
}

export interface DatabaseCollection<T extends object> {
  create(id: string, data: T): Promise<void>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<StoredDocument<T> | undefined>;
  query(options?: QueryOptions<T>): Promise<StoredDocument<T>[]>;
  set(id: string, data: T): Promise<void>;
  update(id: string, updater: (current: T) => T): Promise<T>;
}

export type DatabaseCollections<Definitions extends CollectionDefinitions> = {
  [Name in keyof Definitions]: DatabaseCollection<DocumentFor<Definitions[Name]>>;
};

export type DatabaseBackfillMutation =
  | { type: "delete" }
  | { type: "set"; data: Record<string, unknown>; merge?: boolean }
  | { type: "skip" };

export interface DatabaseMigration<Definitions extends CollectionDefinitions> {
  checksum: string;
  description: string;
  id: string;
  run(context: DatabaseMigrationContext<Definitions>): Promise<void>;
}

export interface DatabaseMigrationContext<Definitions extends CollectionDefinitions> {
  backfill<Name extends keyof Definitions & string>(options: {
    collection: Name;
    pageSize?: number;
    step: string;
    transform: (document: { data: unknown; id: string }) => DatabaseBackfillMutation;
  }): Promise<{ changed: number; processed: number }>;
}

export function defineDatabaseMigrations<Definitions extends CollectionDefinitions>(
  migrations: readonly DatabaseMigration<Definitions>[],
): readonly DatabaseMigration<Definitions>[] {
  defineMigrations(
    migrations.map(({ checksum, description, id }) => ({
      checksum,
      description,
      id,
      run: async () => undefined,
    })),
  );

  return Object.freeze([...migrations]);
}

export interface FirestoreDatabaseOptions<Definitions extends CollectionDefinitions> {
  collections: Definitions;
  databaseId: string;
  migrations?: readonly DatabaseMigration<Definitions>[];
}

export interface FirestoreDatabase<Definitions extends CollectionDefinitions> {
  assertCurrent(): Promise<void>;
  collections: DatabaseCollections<Definitions>;
  migrate(): Promise<MigrationRunResult>;
  transaction<Result>(
    operation: (database: { collections: DatabaseCollections<Definitions> }) => Promise<Result>,
  ): Promise<Result>;
}

const databases = new Map<
  string,
  { configurationKey: string; database: FirestoreDatabase<CollectionDefinitions> }
>();

function getManagedFirestore(databaseId: string): Firestore {
  if (!databaseId) {
    throw new Error("databaseId must be configured for Firestore access.");
  }

  const app =
    getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  return getFirestore(app, databaseId);
}

function firestoreData(data: object): DocumentData {
  return data as DocumentData;
}

function buildQuery<T extends object>(
  firestore: Firestore,
  path: string,
  options: QueryOptions<T> | undefined,
): Query<DocumentData> {
  let query: Query<DocumentData> = firestore.collection(path);

  for (const filter of options?.where ?? []) {
    query = query.where(filter.field, filter.operator, filter.value);
  }
  for (const order of options?.orderBy ?? []) {
    query = query.orderBy(order.field, order.direction);
  }
  if (options?.limit !== undefined) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
      throw new Error("Query limits must be positive integers.");
    }
    query = query.limit(options.limit);
  }

  return query;
}

function collectionFacade<T extends object>(
  firestore: Firestore,
  definition: CollectionDefinition<z.ZodType<T>>,
  guardedTransaction: <Result>(
    operation: (transaction: Transaction) => Promise<Result>,
  ) => Promise<Result>,
  transaction?: Transaction,
): DatabaseCollection<T> {
  const collection = firestore.collection(definition.path);
  const parse = (
    snapshot: QueryDocumentSnapshot<DocumentData>,
  ): StoredDocument<T> => {
    const result = definition.schema.safeParse(snapshot.data());
    if (!result.success) {
      throw new DocumentValidationError(
        definition.path,
        snapshot.id,
        result.error,
      );
    }
    return { data: result.data, id: snapshot.id };
  };
  const parseWrite = (id: string, data: T): T => {
    const result = definition.schema.safeParse(data);
    if (!result.success) {
      throw new DocumentValidationError(definition.path, id, result.error);
    }
    return result.data;
  };
  const withinTransaction = <Result>(
    operation: (activeTransaction: Transaction) => Promise<Result>,
  ): Promise<Result> =>
    transaction === undefined
      ? guardedTransaction(operation)
      : operation(transaction);

  return {
    async create(id, data) {
      const validated = parseWrite(id, data);
      await withinTransaction(async (activeTransaction) => {
        const reference = collection.doc(id);
        const existing = await activeTransaction.get(reference);
        if (existing.exists) {
          throw new Error(`Document "${definition.path}/${id}" already exists.`);
        }
        activeTransaction.create(reference, firestoreData(validated));
      });
    },
    async delete(id) {
      await withinTransaction(async (activeTransaction) => {
        activeTransaction.delete(collection.doc(id));
      });
    },
    async get(id) {
      const snapshot =
        transaction === undefined
          ? await collection.doc(id).get()
          : await transaction.get(collection.doc(id));
      return snapshot.exists
        ? parse(snapshot as QueryDocumentSnapshot<DocumentData>)
        : undefined;
    },
    async query(options) {
      const query = buildQuery(firestore, definition.path, options);
      const snapshot =
        transaction === undefined ? await query.get() : await transaction.get(query);
      return snapshot.docs.map(parse);
    },
    async set(id, data) {
      const validated = parseWrite(id, data);
      await withinTransaction(async (activeTransaction) => {
        activeTransaction.set(collection.doc(id), firestoreData(validated));
      });
    },
    async update(id, updater) {
      return withinTransaction(async (activeTransaction) => {
        const reference = collection.doc(id);
        const snapshot = await activeTransaction.get(reference);
        if (!snapshot.exists) {
          throw new Error(`Document "${definition.path}/${id}" does not exist.`);
        }
        const updated = parseWrite(
          id,
          updater(parse(snapshot as QueryDocumentSnapshot<DocumentData>).data),
        );
        activeTransaction.set(reference, firestoreData(updated));
        return updated;
      });
    },
  };
}

export function createFirestoreDatabase<Definitions extends CollectionDefinitions>(
  options: FirestoreDatabaseOptions<Definitions>,
): FirestoreDatabase<Definitions> {
  const migrations = defineDatabaseMigrations(options.migrations ?? []);
  const configurationKey = JSON.stringify({
    collections: Object.entries(options.collections).map(([name, definition]) => [
      name,
      definition.path,
    ]),
    migrations: migrations.map(({ checksum, id }) => [id, checksum]),
  });
  const existing = databases.get(options.databaseId);
  if (existing) {
    if (existing.configurationKey !== configurationKey) {
      throw new Error(
        `A different Firestore database facade is already configured for "${options.databaseId}".`,
      );
    }
    return existing.database as unknown as FirestoreDatabase<Definitions>;
  }

  const firestore = getManagedFirestore(options.databaseId);
  const internalMigrations: readonly FirestoreMigration[] = migrations.map(
    (migration) => ({
      checksum: migration.checksum,
      description: migration.description,
      id: migration.id,
      async run(context) {
        await migration.run({
          async backfill(backfillOptions) {
            const definition = options.collections[backfillOptions.collection];
            if (!definition) {
              throw new Error(
                `Migration "${migration.id}" refers to an unknown collection "${backfillOptions.collection}".`,
              );
            }

            return context.backfill({
              collectionPath: definition.path,
              pageSize: backfillOptions.pageSize,
              step: backfillOptions.step,
              transform(snapshot): BackfillMutation {
                const mutation = backfillOptions.transform({
                  data: snapshot.data(),
                  id: snapshot.id,
                });
                if (mutation.type !== "set") {
                  return mutation;
                }

                const finalData = mutation.merge
                  ? { ...snapshot.data(), ...mutation.data }
                  : mutation.data;
                const parsed = definition.schema.safeParse(finalData);
                if (!parsed.success) {
                  throw new DocumentValidationError(
                    definition.path,
                    snapshot.id,
                    parsed.error,
                  );
                }
                return mutation.merge
                  ? { ...mutation, data: firestoreData(mutation.data) }
                  : { ...mutation, data: firestoreData(parsed.data as object) };
              },
            });
          },
        });
      },
    }));

  const guardedTransaction = <Result>(
    operation: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result> =>
    firestore.runTransaction(async (transaction) => {
      await assertMigrationsCurrentInTransaction(
        transaction,
        firestore,
        internalMigrations,
      );
      return operation(transaction);
    });
  const collectionsFor = (transaction?: Transaction): DatabaseCollections<Definitions> =>
    Object.fromEntries(
      Object.entries(options.collections).map(([name, definition]) => [
        name,
        collectionFacade(
          firestore,
          definition as CollectionDefinition<z.ZodType<object>>,
          guardedTransaction,
          transaction,
        ),
      ]),
    ) as unknown as DatabaseCollections<Definitions>;

  const database: FirestoreDatabase<Definitions> = {
    assertCurrent: () => assertMigrationsCurrent(firestore, internalMigrations),
    collections: collectionsFor(),
    migrate: () => runMigrations(firestore, internalMigrations),
    transaction: (operation) =>
      guardedTransaction((transaction) =>
        operation({ collections: collectionsFor(transaction) }),
      ),
  };
  databases.set(options.databaseId, {
    configurationKey,
    database: database as unknown as FirestoreDatabase<CollectionDefinitions>,
  });
  return database;
}
