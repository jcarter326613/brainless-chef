import type { InferenceJob } from "@brainless-chef/database";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type InferenceDatabase, processJob } from "../src/process-job.js";

const queuedJob: InferenceJob = {
  createdAtMs: 1_000,
  input: "Pasted recipe",
  output: "",
  status: "queued",
  updatedAtMs: 1_000,
};

let currentJob: InferenceJob | undefined;
const get = vi.fn(async (id: string) =>
  currentJob ? { data: currentJob, id } : undefined,
);
const update = vi.fn(
  async (_id: string, updater: (current: InferenceJob) => InferenceJob) => {
    if (!currentJob) throw new Error("missing job");
    currentJob = updater(currentJob);
    return currentJob;
  },
);
const database: InferenceDatabase = {
  collections: { inferenceJobs: { get, update } },
  transaction: async (operation) => operation(database),
};
const infer = vi.fn();
const logger = { error: vi.fn(), info: vi.fn() };
let timestamp: number;

beforeEach(() => {
  vi.clearAllMocks();
  currentJob = { ...queuedJob };
  timestamp = 1_000;
  infer.mockResolvedValue('{"title":"Bread","ingredients":[],"instructions":[]}');
});

describe("processJob", () => {
  it("claims, infers, and completes a queued job", async () => {
    const processed = await processJob("job-1", {
      database,
      infer,
      logger,
      now: () => (timestamp += 100),
    });

    expect(processed).toBe(true);
    expect(infer).toHaveBeenCalledWith("Pasted recipe");
    expect(currentJob).toEqual({
      ...queuedJob,
      finishedAtMs: 1_200,
      output: '{"title":"Bread","ingredients":[],"instructions":[]}',
      startedAtMs: 1_100,
      status: "succeeded",
      updatedAtMs: 1_200,
    });
  });

  it("does not process a missing or already claimed job", async () => {
    currentJob = undefined;
    await expect(processJob("missing", { database, infer, logger })).resolves.toBe(false);
    expect(infer).not.toHaveBeenCalled();

    currentJob = { ...queuedJob, startedAtMs: 1_100, status: "running" };
    await expect(processJob("job-1", { database, infer, logger })).resolves.toBe(false);
    expect(infer).not.toHaveBeenCalled();
  });

  it("records a sanitized failure and propagates the inference error", async () => {
    infer.mockRejectedValue(new Error("native model details"));

    await expect(
      processJob("job-1", {
        database,
        infer,
        logger,
        now: () => (timestamp += 100),
      }),
    ).rejects.toThrow("native model details");

    expect(currentJob).toEqual({
      ...queuedJob,
      error: "Recipe inference failed.",
      finishedAtMs: 1_200,
      startedAtMs: 1_100,
      status: "failed",
      updatedAtMs: 1_200,
    });
  });
});
