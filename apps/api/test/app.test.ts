import type { InferenceJob } from "@brainless-chef/database";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createApp, type InferenceJobCollection } from "../src/app.js";

const queuedJob: InferenceJob = {
  createdAtMs: 1_000,
  input: "1 cup flour. Mix and bake.",
  status: "queued",
  updatedAtMs: 1_000,
};

const inferenceJobs = {
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
};
const dispatchWorker = vi.fn();
const logger = { error: vi.fn() };

const app = () =>
  createApp({
    dispatchWorker,
    inferenceJobs: inferenceJobs as InferenceJobCollection,
    logger,
    now: () => 1_000,
  });

beforeEach(() => {
  vi.clearAllMocks();
  inferenceJobs.create.mockResolvedValue({ data: queuedJob, id: "job-1" });
  dispatchWorker.mockResolvedValue(undefined);
});

describe("API", () => {
  it("reports health", async () => {
    await request(app()).get("/health").expect(200, { status: "ok" });
  });

  it("creates and dispatches an inference job", async () => {
    const response = await request(app())
      .post("/inference-jobs")
      .send({ input: "  1 cup flour. Mix and bake.  " })
      .expect(202);

    expect(inferenceJobs.create).toHaveBeenCalledWith(queuedJob);
    expect(dispatchWorker).toHaveBeenCalledWith("job-1");
    expect(response.headers.location).toBe("/inference-jobs/job-1");
    expect(response.body).toEqual({ data: queuedJob, id: "job-1" });
  });

  it("rejects invalid input without creating a job", async () => {
    await request(app())
      .post("/inference-jobs")
      .send({ input: "", unexpected: true })
      .expect(400);

    expect(inferenceJobs.create).not.toHaveBeenCalled();
    expect(dispatchWorker).not.toHaveBeenCalled();
  });

  it("rejects oversized request bodies", async () => {
    await request(app())
      .post("/inference-jobs")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ input: "x".repeat(100_000) }))
      .expect(413, {
        error: { code: "request_too_large", message: "Request body is too large." },
      });

    expect(inferenceJobs.create).not.toHaveBeenCalled();
  });

  it("marks a job failed when worker dispatch fails", async () => {
    dispatchWorker.mockRejectedValue(new Error("permission denied"));
    inferenceJobs.update.mockImplementation(
      async (_id: string, updater: (current: InferenceJob) => InferenceJob) =>
        updater(queuedJob),
    );

    const response = await request(app())
      .post("/inference-jobs")
      .send({ input: queuedJob.input })
      .expect(503);

    expect(response.body).toMatchObject({
      data: { error: "Worker dispatch failed.", status: "failed" },
      id: "job-1",
    });
    expect(response.body.data).not.toHaveProperty("startedAtMs");
  });

  it("returns an inference job", async () => {
    inferenceJobs.get.mockResolvedValue({ data: queuedJob, id: "job-1" });

    await request(app())
      .get("/inference-jobs/job-1")
      .expect(200, { data: queuedJob, id: "job-1" });
  });

  it("returns not found for a missing inference job", async () => {
    inferenceJobs.get.mockResolvedValue(undefined);

    await request(app()).get("/inference-jobs/missing").expect(404, {
      error: { code: "not_found", message: "Inference job not found." },
    });
  });

  it.each(["__reserved__", "x".repeat(1_501)])("rejects invalid job ID", async (jobId) => {
    await request(app()).get(`/inference-jobs/${jobId}`).expect(400);
    expect(inferenceJobs.get).not.toHaveBeenCalled();
  });

  it("returns sanitized errors for database failures", async () => {
    inferenceJobs.get.mockRejectedValue(new Error("database credentials"));

    await request(app()).get("/inference-jobs/job-1").expect(500, {
      error: { code: "internal_error", message: "An unexpected error occurred." },
    });
  });
});
