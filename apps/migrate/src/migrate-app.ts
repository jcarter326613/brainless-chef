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
      get(id: string): Promise<{ data: MigrationTask; id: string } | undefined>;
      set(id: string, data: MigrationTask): Promise<void>;
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
    error: task.error,
    imageTag: task.imageTag,
    registryFingerprint: task.registryFingerprint,
    requestId: task.requestId,
    state: task.state,
    updatedAtEpoch: Date.now(),
  };
}

export function createMigrateApp(options: MigrateAppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1kb" }));

  app.get("/__migrate/status/:requestId", async (req, res) => {
    const record = await options.database.collections.migrationTasks.get(req.params.requestId);
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
    const existing = await options.database.collections.migrationTasks.get(requestId);
    if (existing) {
      // Cloud Tasks delivers at least once. A task never re-runs after being
      // observed; a repeated delivery must not start a second migration.
      res.status(existing.data.state === "succeeded" ? 200 : 409).json(existing.data);
      return;
    }

    await options.database.collections.migrationTasks.set(
      requestId,
      toRecord({ requestId, imageTag, state: "running", appliedMigrations: [], registryFingerprint: "" }),
    );

    try {
      const result = await options.database.migrate();
      await options.database.collections.migrationTasks.set(
        requestId,
        toRecord({
          requestId,
          imageTag,
          state: "succeeded",
          appliedMigrations: result.applied,
          registryFingerprint: result.registryFingerprint,
        }),
      );
      res.json({
        state: "succeeded" as const,
        requestId,
        appliedMigrations: result.applied,
        registryFingerprint: result.registryFingerprint,
      });
    } catch (error) {
      await options.database.collections.migrationTasks.set(
        requestId,
        toRecord({
          requestId,
          imageTag,
          state: "failed",
          appliedMigrations: [],
          registryFingerprint: "",
          error: error instanceof Error ? error.message : "unknown migration failure",
        }),
      );
      // Non-2xx so Cloud Tasks records a failed attempt; retries are disabled.
      res.status(500).json({ error: "migration_failed" });
    }
  });

  return app;
}

export type MigrationServerApp = ReturnType<typeof createMigrateApp>;