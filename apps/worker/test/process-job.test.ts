import { recipeSchema, type InferenceJob, type Recipe } from "@brainless-chef/database";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type InferenceDatabase, processJob } from "../src/process-job.js";

vi.hoisted(() => {
  process.env.FIRESTORE_DATABASE_ID = "worker-test";
});

const queuedJob: InferenceJob = {
  createdAtMs: 1_000,
  input: "Pasted recipe",
  status: "queued",
  updatedAtMs: 1_000,
};

const recipe: Recipe = recipeSchema.parse({
  cook: {
    finalOutputId: "cook-output-1",
    tasks: [
      {
        action: { type: "serve" },
        completion: null,
        duration: null,
        id: "cook-task-1",
        inputs: [{ id: "prep-object-1", type: "prepObject" }],
        instruction: "Serve the flour.",
        output: { id: "cook-output-1", label: "Flour", locationToolId: null },
        tools: [],
      },
    ],
  },
  ingredients: [
    {
      id: "ingredient-flour",
      notes: [],
      optional: false,
      quantity: { kind: "exact", packageSize: null, unit: "cup", value: 1 },
    },
  ],
  prep: {
    tasks: [
      {
        action: { type: "measure" },
        id: "prep-task-1",
        inputs: [{ id: "ingredient-flour", quantity: { kind: "exact", unit: "cup", value: 1 }, type: "ingredient" }],
        instruction: "Measure the flour.",
        output: { id: "prep-object-1", label: "Measured flour", locationToolId: null },
        tools: [],
      },
    ],
  },
  schemaVersion: "1.0",
  source: { author: null, title: null, type: "pasted-text" },
  title: "Flour",
  tools: [],
  yield: { quantity: null, unit: null },
});

let currentJob: InferenceJob | undefined;
const catalog = new Map<string, { name: string }>();
const recipes = new Map<string, Recipe>();
const inferenceJobs = {
  get: vi.fn(async (id: string) => (currentJob ? { data: currentJob, id } : undefined)),
  update: vi.fn(async (_id: string, updater: (current: InferenceJob) => InferenceJob) => {
    if (!currentJob) throw new Error("missing job");
    currentJob = updater(currentJob);
    return currentJob;
  }),
};
const ingredients = {
  get: vi.fn(async (id: string) => {
    const data = catalog.get(id);
    return data ? { data, id } : undefined;
  }),
  query: vi.fn(async () => [...catalog.entries()].map(([id, data]) => ({ data, id }))),
  set: vi.fn(async (id: string, data: { name: string }) => {
    catalog.set(id, data);
  }),
};
const recipeCollection = {
  set: vi.fn(async (id: string, data: Recipe) => {
    recipes.set(id, data);
  }),
};
const database: InferenceDatabase = {
  collections: { inferenceJobs, ingredients, recipes: recipeCollection },
  transaction: async (operation) => operation(database),
};
const ingest = vi.fn();
const logger = { error: vi.fn(), info: vi.fn() };
let timestamp: number;

beforeEach(() => {
  vi.clearAllMocks();
  currentJob = { ...queuedJob };
  catalog.clear();
  recipes.clear();
  timestamp = 1_000;
  ingest.mockResolvedValue({
    newIngredients: [{ data: { name: "Flour" }, id: "ingredient-flour" }],
    recipe,
  });
});

describe("processJob", () => {
  it("persists catalog ingredients and the recipe before completing with its ID", async () => {
    const processed = await processJob("job-1", {
      database,
      ingest,
      logger,
      now: () => (timestamp += 100),
    });

    expect(processed).toBe(true);
    expect(ingest).toHaveBeenCalledWith("Pasted recipe", []);
    expect(catalog.get("ingredient-flour")).toEqual({ name: "Flour" });
    expect(recipes.get("job-1")).toEqual(recipe);
    expect(currentJob).toEqual({
      ...queuedJob,
      finishedAtMs: 1_200,
      recipeId: "job-1",
      startedAtMs: 1_100,
      status: "succeeded",
      updatedAtMs: 1_200,
    });
  });

  it("does not process a missing or already claimed job", async () => {
    currentJob = undefined;
    await expect(processJob("missing", { database, ingest, logger })).resolves.toBe(false);
    expect(ingest).not.toHaveBeenCalled();

    currentJob = { ...queuedJob, startedAtMs: 1_100, status: "running" };
    await expect(processJob("job-1", { database, ingest, logger })).resolves.toBe(false);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("records a sanitized failure and propagates the ingestion error", async () => {
    ingest.mockRejectedValue(new Error("model details"));

    await expect(
      processJob("job-1", {
        database,
        ingest,
        logger,
        now: () => (timestamp += 100),
      }),
    ).rejects.toThrow("model details");

    expect(currentJob).toEqual({
      ...queuedJob,
      error: "Recipe ingestion failed.",
      finishedAtMs: 1_200,
      startedAtMs: 1_100,
      status: "failed",
      updatedAtMs: 1_200,
    });
  });
});
