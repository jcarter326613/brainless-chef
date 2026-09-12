# Brainless Chef Database

`@brainless-chef/database` defines Brainless Chef's server-only Zod schemas,
collection map, and ordered migration registry. It configures the generic,
connection-owning [`firestore-database`](https://github.com/jcarter326613/firestore-database)
facade, which performs all
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
- Follow the query and expand/contract requirements in the
  [`firestore-database` documentation](https://github.com/jcarter326613/firestore-database).

Example repository definition:

```ts
import { z } from "zod";

import {
  createFirestoreDatabase,
  defineCollection,
} from "firestore-database";

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

## Stored Documents

- `inferenceJobs` documents contain pasted recipe text, a blank or completed raw
  model output, status, process-clock timestamps, and a sanitized failure message
  when applicable. The worker claims queued jobs transactionally before inference.
- `ingredients` documents are a canonical ingredient catalog containing a
  non-empty `name`.
- `recipes` documents use schema version `1.0` and contain source provenance,
  yield, recipe-scoped ingredient requirements that reference catalog IDs,
  physical tool slots, prep tasks and objects, and cook tasks.

Recipe quantities distinguish exact, range, approximate, to-taste, and
as-needed amounts. Numeric units are normalized to lowercase. Every numeric
prep allocation is explicit and must reconcile with the recipe ingredient's
total without inventing unit conversions.

Recipe validation models material flow as two DAGs. Prep tasks may consume
catalog ingredients or prep objects, and produce a prep object. Cook tasks may
consume prep objects and earlier cook outputs, never raw ingredients. Every
prep object has one producing prep task and exactly one prep or cook consumer.
Tool references, prep-object input graphs, and output references are validated.
Catalog ingredient existence remains a transactional write-flow responsibility.

See the
[`firestore-database` documentation](https://github.com/jcarter326613/firestore-database)
for compatible-release and migration requirements.
