import { database } from "@brainless-chef/database";

const result = await database.migrate();

console.log(
  JSON.stringify({
    appliedMigrations: result.applied,
    registryFingerprint: result.registryFingerprint,
  }),
);
