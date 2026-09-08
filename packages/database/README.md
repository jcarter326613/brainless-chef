# Brainless Chef Database

`@brainless-chef/database` defines Brainless Chef's server-only Zod schemas,
collection map, and ordered migration registry. It configures the generic,
connection-owning `packages/firestore-database` facade, which performs all
Firebase Admin access, validation, querying, transactions, and migration
fencing.

## Coding Contract

- Define every persisted document with a strict Zod schema and infer its
  TypeScript type from that schema.
- Define collections with `defineCollection`, then export the single `database`
  facade from `src/database.ts`. API handlers and backend jobs must not access
  application collections through raw Firestore calls.
- Use the typed operations on `database.collections`. They validate all writes,
  point reads, and every document returned by a query, stripping fields outside
  the running schema.
- Build queries with the typed declarative `where`, `orderBy`, and `limit`
  options. Query results are never migrated on read and invalid documents are
  never silently skipped.
- Migrations and normal application writes use transactions, so conflicting
  changes to one document retry safely while unrelated production work continues.
- Add explicit storage migrations to `src/database.ts` only after every
  application that requires the old stored shape is gone. Never reorder,
  delete, or edit a migration that has run in a shared environment.
- Follow the query and expand/contract requirements in
  `packages/firestore-database/README.md`.

Example repository definition:

```ts
import { z } from "zod";

import {
  createFirestoreDatabase,
  defineCollection,
} from "@brainless-chef/firestore-database";

const exampleSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict();

const collections = {
  examples: defineCollection({
    path: "examples",
    schema: exampleSchema,
  }),
};

export const database = createFirestoreDatabase({
  collections,
  databaseId: process.env.FIRESTORE_DATABASE_ID!,
});

const namedExamples = await database.collections.examples.query({
  where: [{ field: "name", operator: "==", value: "Example" }],
});
```

The collection map is intentionally empty until the first application document
schema is introduced. See `packages/firestore-database/README.md` for
compatible-release and migration requirements.
