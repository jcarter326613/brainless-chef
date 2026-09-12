import { describe, expect, it } from "vitest";

import { inferenceJobSchema } from "../../../src/schemas/index.js";

const queuedInferenceJob = {
  createdAtMs: 1_000,
  input: "A pasted bread recipe",
  output: "",
  status: "queued" as const,
  updatedAtMs: 1_000,
};

describe("inferenceJobSchema", () => {
  it("accepts each valid job state", () => {
    expect(inferenceJobSchema.parse(queuedInferenceJob)).toEqual(queuedInferenceJob);
    expect(
      inferenceJobSchema.parse({
        ...queuedInferenceJob,
        startedAtMs: 1_100,
        status: "running",
        updatedAtMs: 1_100,
      }),
    ).toMatchObject({ status: "running" });
    expect(
      inferenceJobSchema.parse({
        ...queuedInferenceJob,
        finishedAtMs: 1_200,
        output: "Extracted recipe",
        startedAtMs: 1_100,
        status: "succeeded",
        updatedAtMs: 1_200,
      }),
    ).toMatchObject({ status: "succeeded" });
    expect(
      inferenceJobSchema.parse({
        ...queuedInferenceJob,
        error: "Recipe inference failed.",
        finishedAtMs: 1_200,
        startedAtMs: 1_100,
        status: "failed",
        updatedAtMs: 1_200,
      }),
    ).toMatchObject({ status: "failed" });
  });

  it.each([
    [{ ...queuedInferenceJob, output: "too early" }],
    [{ ...queuedInferenceJob, startedAtMs: 1_100, status: "running" }],
    [
      {
        ...queuedInferenceJob,
        finishedAtMs: 1_200,
        output: "",
        startedAtMs: 1_100,
        status: "succeeded",
        updatedAtMs: 1_200,
      },
    ],
    [
      {
        ...queuedInferenceJob,
        finishedAtMs: 1_200,
        status: "failed",
        updatedAtMs: 1_200,
      },
    ],
  ])("rejects an invalid job state", (job) => {
    expect(inferenceJobSchema.safeParse(job).success).toBe(false);
  });

  it("rejects unknown fields and invalid timestamp order", () => {
    expect(
      inferenceJobSchema.safeParse({ ...queuedInferenceJob, unexpected: true }).success,
    ).toBe(false);
    expect(
      inferenceJobSchema.safeParse({ ...queuedInferenceJob, updatedAtMs: 999 }).success,
    ).toBe(false);
  });
});
