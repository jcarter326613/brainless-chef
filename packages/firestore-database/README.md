# Firestore Database

`@brainless-chef/firestore-database` is a generic, connection-owning,
forward-only data layer for Google Cloud Firestore. It is intentionally separate
from Brainless Chef database schemas so it can move to its own repository later.

Applications supply Zod schemas, collection definitions, and migrations to
`createFirestoreDatabase`. The resulting facade owns Firebase Admin
initialization, Firestore access, validation, queries, and transaction fencing.
Application code never receives a Firestore client, collection reference, query,
or transaction. Each process configures at most one facade for a database ID;
later calls with the same collection and migration configuration reuse it.

## Guarantees

- An ordered ledger records every migration and checksum.
- A transactional lease with a monotonically increasing fencing token permits
  only one runner to make progress in a database.
- A heartbeat renews the lease during long-running migrations.
- Collection backfills checkpoint after each page. Document writes, the page
  cursor, and lease renewal commit in one Firestore transaction.
- A restarted migration skips completed steps and resumes a backfill after its
  last committed document ID.
- Completed migration checksums and ordering are verified before new work.
- The database state contains a registry fingerprint that the facade verifies
  at startup and transactionally before every application write.

Firestore does not provide a database-wide or collection-wide lock. The facade
sets `migrationInProgress` before changing data and automatically verifies that
state inside every write transaction. Application code cannot bypass that guard
through the supported API. Reads may continue, so releases must follow the
expand/contract rules below.

## Application Setup

The importing application defines collection schemas and migrations, then gives
them to the connection-owning facade. It supplies only a Firestore database ID;
the package initializes Firebase Admin with Application Default Credentials.

```ts
import { z } from "zod";
import {
  createFirestoreDatabase,
  defineCollection,
  defineDatabaseMigrations,
} from "@brainless-chef/firestore-database";

const recipeSchema = z
  .object({
    title: z.string().min(1),
    visibility: z.enum(["draft", "published"]),
  })
  .strict();

const collections = {
  recipes: defineCollection({ path: "recipes", schema: recipeSchema }),
};

const migrations = defineDatabaseMigrations<typeof collections>([]);

export const database = createFirestoreDatabase({
  collections,
  databaseId: process.env.FIRESTORE_DATABASE_ID!,
  migrations,
});
```

Zod schemas are the source of truth for TypeScript document types. The facade
validates complete documents after every read and before every write.

```ts
const recipe = await database.collections.recipes.get("recipe-1");

const published = await database.collections.recipes.query({
  orderBy: [{ field: "title", direction: "asc" }],
  where: [{ field: "visibility", operator: "==", value: "published" }],
});

await database.collections.recipes.update("recipe-1", (current) => ({
  ...current,
  visibility: "published",
}));
```

Use `database.transaction` for atomic work that spans collections. It receives
the same typed collection API, not a raw Firestore transaction, and adds the
migration guard automatically.

## Defining Migrations

Migrations have sortable, immutable IDs. Use a timestamp prefix so later files
sort after every applied migration.

```ts
import {
  defineDatabaseMigrations,
  migrationChecksum,
} from "@brainless-chef/firestore-database";

export const migrations = defineDatabaseMigrations<typeof collections>([
  {
    id: "202609071200-add-normalized-title",
    description: "Populate normalizedTitle on recipes",
    checksum: migrationChecksum("recipe normalizedTitle migration v1"),
    async run(context) {
      await context.backfill({
        collection: "recipes",
        step: "recipes",
        transform(document) {
          const data = document.data as { title?: unknown; normalizedTitle?: unknown };
          const normalizedTitle = String(data.title).trim().toLowerCase();

          return data.normalizedTitle === normalizedTitle
            ? { type: "skip" }
            : {
                type: "set",
                merge: true,
                data: { normalizedTitle },
              };
        },
      });
    },
  },
]);
```

The checksum is a reviewed identity for the migration contents. Change it while
developing an unapplied migration. Never change the migration or checksum after
it has run in any shared environment. A future standalone repository should add
a file-based CLI that computes checksums automatically.

`backfill` scans by immutable Firestore document ID. Its synchronous transform
must be deterministic and have no external side effects because Firestore can
retry the transaction callback. It may return `set`, `delete`, or `skip`.
Page size defaults to 100 and is capped at 400 to stay below Firestore's
500-write transaction limit. Firestore also limits transaction request size to
10 MiB. The runner halves a page and retries when Firestore reports resource
exhaustion or an oversized request; a single oversized document still fails and
must be corrected operationally.

Use `backfill` for document changes. It intentionally receives historical
document data as `unknown`: persisted data may predate the current strict Zod
schema. Parse and transform that data explicitly, then return `set`, `delete`,
or `skip`. The facade does not expose raw Firestore write APIs to migrations.

## Queries And Schema Changes

The migration job upgrades the database before new application code is
deployed. Runtime reads never repair documents individually. Repositories must
validate every point read and every document returned by a query against the
current Zod schema; malformed data is an error and must never be silently
omitted.

A Firestore query cannot discover a document when its old shape does not match a
new filter or order. Any migration that adds, renames, removes, or changes a
field used by a filter, sort, index, or cursor must backfill the entire
collection before application code issues the new query.

## Deployment Rules

Migrations are forward-only and use expand/contract releases:

1. Deploy strict schemas that accept the old shape plus the optional new field,
   without backfilling it yet.
2. In a later release, backfill the field and deploy writers that always provide
   it. The previous release can still read both shapes.
3. Remove obsolete fields only in another release after rollback and old-writer
   compatibility have been deliberately retired.

Do not perform destructive shape changes in the same release that introduces
their replacement. The migration job runs while the previous Cloud Run revision
may still serve reads. Guarded application writes stop while a migration is in
progress, but reads remain available.

Run `database.migrate()` as a dedicated job before deploying services. Application
startup calls `database.assertCurrent()` and refuses to serve against a database
whose registry fingerprint differs. Do not run migrations from an API startup
path. Exact fingerprint checks also mean rollback is supported only between
application images with the same migration registry; cross-migration rollback
requires a new forward migration or a deliberate database restore.

## Failure Recovery

The ledger is stored under `__firestore_migrations/state/ledger`; lease and
database state documents are in `__firestore_migrations`. These paths are owned
by the runner and must not be edited manually during normal operation.

On failure, inspect the Cloud Run Job log and the failed ledger entry. Re-running
the same artifact resumes from its last committed step. If migration code itself
must be corrected, change its checksum; the runner restarts that migration's
steps from the beginning, so its operations must be idempotent over any changes
already committed by the failed attempt. Never change a completed migration's
checksum. Do not delete ledger entries or bypass a live lease. An expired lease
is reclaimed transactionally by the next runner with a higher fencing token.

## Extraction Boundary

Keep this package free of project-specific schemas, migrations, collection
names, deployment commands, and environment-specific configuration. It owns the
Firebase Admin connection but callers provide the database ID. Before publishing
it independently, add emulator integration tests, generated file-content
checksums, package provenance, semantic versioning, and a public support policy.
The Brainless Chef-specific package is `packages/database` and must consume this
package only through its public exports.
