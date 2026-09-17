import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().positive().default(8080),
  firestoreDatabaseId: z.string().trim().min(1),
});

export type MigrateConfig = z.output<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MigrateConfig {
  return configSchema.parse({
    port: env.PORT,
    firestoreDatabaseId: env.FIRESTORE_DATABASE_ID,
  });
}