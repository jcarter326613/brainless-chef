import type { MigrationTask } from "@brainless-chef/database";
import express from "express";
import { z } from "zod";

import type { MigrateConfig } from "./config.js";

const requestBodySchema = z.object({
  requestId: z.string().trim().min(1),
  imageTag: z.string().trim().min(1),
});

export interface MigrateAppDatabase {
  migrate(): Promise<{ applied: string[]; registryFingerprint: string }>;
  collections: {
    migrationTasks: {
      create(data: MigrationTask): Promise<{ data: MigrationTask; id: string }>;
      patch(
        id: string,
        updater: (current: MigrationTask) => Partial<MigrationTask>,
      ): Promise<void>;
      query(options: {
        where: ReadonlyArray<{
          field: "requestId";
          operator: "==";
          value: string;
        }>;
      }): Promise<Array<{ data: MigrationTask; id: string }>>;
    };
  };
}

export interface MigrateAppOptions {
  config: MigrateConfig;
  database: MigrateAppDatabase;
}

function toRecord(
  task: Pick<MigrationTask, "requestId" | "imageTag" | "state" | "appliedMigrations" | "registryFingerprint" | "error">,
): MigrationTask {
  return {
    appliedMigrations: task.appliedMigrations,
    ...(task.error === undefined ? {} : { error: task.error }),
    imageTag: task.imageTag,
    registryFingerprint: task.registryFingerprint,
    requestId: task.requestId,
    state: task.state,
    updatedAtEpoch: Date.now(),
  };
}

async function findTask(
  database: MigrateAppDatabase,
  requestId: string,
): Promise<{ data: MigrationTask; id: string } | undefined> {
  const matches = await database.collections.migrationTasks.query({
    where: [{ field: "requestId", operator: "==", value: requestId }],
  });
  return matches[0];
}

export function createMigrateApp(options: MigrateAppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1kb" }));

  app.get("/__migrate/status/:requestId", async (req, res) => {
    const record = await findTask(options.database, req.params.requestId);
    if (!record) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(record.data);
  });

  app.post("/__migrate", async (req, res) => {
    const parsed = requestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const { requestId, imageTag } = parsed.data;
    const existing = await findTask(options.database, requestId);
    if (existing) {
      // Cloud Tasks delivers at least once. A task never re-runs after being
      // observed; a repeated delivery must not start a second migration.
      res.status(existing.data.state === "succeeded" ? 200 : 409).json(existing.data);
      return;
    }

    const task = await options.database.collections.migrationTasks.create(
      toRecord({ requestId, imageTag, state: "running", appliedMigrations: [], registryFingerprint: "" }),
    );

    try {
      const result = await options.database.migrate();
      await options.database.collections.migrationTasks.patch(task.id, () => ({
        appliedMigrations: result.applied,
        registryFingerprint: result.registryFingerprint,
        state: "succeeded",
        updatedAtEpoch: Date.now(),
      }));
      res.json({
        state: "succeeded" as const,
        requestId,
        appliedMigrations: result.applied,
        registryFingerprint: result.registryFingerprint,
      });
    } catch (error) {
      await options.database.collections.migrationTasks.patch(task.id, () => ({
        appliedMigrations: [],
        error: error instanceof Error ? error.message : "unknown migration failure",
        registryFingerprint: "",
        state: "failed",
        updatedAtEpoch: Date.now(),
      }));
      // Non-2xx so Cloud Tasks records a failed attempt; retries are disabled.
      res.status(500).json({ error: "migration_failed" });
    }
  });

  return app;
}

export type MigrationServerApp = ReturnType<typeof createMigrateApp>;
