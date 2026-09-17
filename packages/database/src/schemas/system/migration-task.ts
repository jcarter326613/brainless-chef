import { z } from "zod";

export const migrationRunStateSchema = z.enum(["running", "succeeded", "failed"]);

export const migrationTaskSchema = z
  .object({
    requestId: z.string().trim().min(1),
    imageTag: z.string().trim().min(1),
    state: migrationRunStateSchema,
    appliedMigrations: z.array(z.string()),
    registryFingerprint: z.string(),
    error: z.string().optional(),
    updatedAtEpoch: z.number(),
  })
  .strict();

export type MigrationTask = z.infer<typeof migrationTaskSchema>;