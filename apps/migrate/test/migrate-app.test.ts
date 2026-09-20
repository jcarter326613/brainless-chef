import type { MigrationTask } from "@brainless-chef/database";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMigrateApp, type MigrateAppDatabase } from "../src/migrate-app.js";

class MemoryDatabase implements MigrateAppDatabase {
  readonly tasks = new Map<string, MigrationTask>();
  failMigrate = false;
  migrateCalls = 0;
  private nextTaskId = 1;

  collections = {
    migrationTasks: {
      create: async (data: MigrationTask) => {
        const id = `task-${this.nextTaskId++}`;
        this.tasks.set(id, data);
        return { data, id };
      },
      patch: async (
        id: string,
        updater: (current: MigrationTask) => Partial<MigrationTask>,
      ) => {
        const current = this.tasks.get(id);
        if (current === undefined) {
          throw new Error(`Missing task ${id}`);
        }
        this.tasks.set(id, { ...current, ...updater(current) });
      },
      query: async ({
        where,
      }: {
        where: ReadonlyArray<{
          field: "requestId";
          operator: "==";
          value: string;
        }>;
      }) => {
        const filter = where[0];
        return [...this.tasks.entries()]
          .filter(([, data]) => data[filter.field] === filter.value)
          .map(([id, data]) => ({ data, id }));
      },
    },
  };

  async migrate() {
    this.migrateCalls += 1;
    if (this.failMigrate) {
      throw new Error("migration crashed");
    }
    return { applied: ["202601010000-init"], registryFingerprint: "abc123" };
  }
}

function makeConfig() {
  return { port: 0, firestoreDatabaseId: "test" };
}

async function startContext() {
  const database = new MemoryDatabase();
  const app = createMigrateApp({ config: makeConfig(), database });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    database,
  };
}

describe("migration server", () => {
  let context: Awaited<ReturnType<typeof startContext>>;

  beforeEach(async () => {
    context = await startContext();
  });

  afterEach(async () => {
    await context.close();
  });

  it("returns 404 before any task is recorded", async () => {
    const response = await fetch(`${context.baseUrl}/__migrate/status/nope`);
    expect(response.status).toBe(404);
  });

  it("rejects a missing or invalid request body", async () => {
    const empty = await fetch(`${context.baseUrl}/__migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);

    const partial = await fetch(`${context.baseUrl}/__migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "migrate-dev-abc" }),
    });
    expect(partial.status).toBe(400);
  });

  it("runs migrations and records a successful task", async () => {
    const response = await fetch(`${context.baseUrl}/__migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "migrate-dev-abc", imageTag: "abc" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      appliedMigrations: ["202601010000-init"],
      registryFingerprint: "abc123",
      requestId: "migrate-dev-abc",
      state: "succeeded",
    });
    expect(context.database.migrateCalls).toBe(1);
    expect(context.database.tasks.get("task-1")).not.toHaveProperty("error");

    const status = await fetch(`${context.baseUrl}/__migrate/status/migrate-dev-abc`);
    await expect(status.json()).resolves.toMatchObject({ state: "succeeded" });
  });

  it("does not re-run a task that already reached a terminal or running state", async () => {
    await fetch(`${context.baseUrl}/__migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "migrate-dev-abc", imageTag: "abc" }),
    });

    const replay = await fetch(`${context.baseUrl}/__migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "migrate-dev-abc", imageTag: "abc" }),
    });

    expect(replay.status).toBe(200);
    expect(context.database.migrateCalls).toBe(1);
  });

  it("records a failed task with the error and returns 500", async () => {
    context.database.failMigrate = true;

    const response = await fetch(`${context.baseUrl}/__migrate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "migrate-dev-bad", imageTag: "bad" }),
    });

    expect(response.status).toBe(500);
    const status = await fetch(`${context.baseUrl}/__migrate/status/migrate-dev-bad`);
    await expect(status.json()).resolves.toMatchObject({
      error: "migration crashed",
      state: "failed",
    });
  });
});
