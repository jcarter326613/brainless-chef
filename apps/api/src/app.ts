import type { InferenceJob } from "@brainless-chef/database";
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";

const createInferenceJobSchema = z
  .object({
    input: z.string().trim().min(1).max(20_000),
  })
  .strict();

const inferenceJobIdSchema = z
  .string()
  .min(1)
  .refine((id) => Buffer.byteLength(id, "utf8") <= 1_500)
  .refine((id) => !id.includes("/") && id !== "." && id !== "..")
  .refine((id) => !/^__.*__$/.test(id));

interface StoredInferenceJob {
  data: InferenceJob;
  id: string;
}

export interface InferenceJobCollection {
  create(data: InferenceJob): Promise<StoredInferenceJob>;
  get(id: string): Promise<StoredInferenceJob | undefined>;
  update(id: string, updater: (current: InferenceJob) => InferenceJob): Promise<InferenceJob>;
}

export interface AppDependencies {
  dispatchWorker(jobId: string): Promise<void>;
  inferenceJobs: InferenceJobCollection;
  logger?: Pick<Console, "error">;
  now?: () => number;
}

const validationIssues = (error: z.ZodError) =>
  error.issues.map(({ message, path }) => ({ message, path }));

export function createApp({
  dispatchWorker,
  inferenceJobs,
  logger = console,
  now = Date.now,
}: AppDependencies) {
  const app = express();

  app.use(express.json({ limit: "96kb" }));

  app.get("/health", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.post("/inference-jobs", async (request, response) => {
    const parsed = createInferenceJobSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: "invalid_request",
          issues: validationIssues(parsed.error),
        },
      });
      return;
    }

    const timestamp = now();
    const job = await inferenceJobs.create({
      createdAtMs: timestamp,
      input: parsed.data.input,
      output: "",
      status: "queued",
      updatedAtMs: timestamp,
    });

    try {
      await dispatchWorker(job.id);
    } catch (error) {
      logger.error("Failed to dispatch inference worker.", error);
      const finishedAtMs = Math.max(now(), job.data.createdAtMs);
      const failedJob = await inferenceJobs.update(job.id, (current) => {
        if (current.status !== "queued") return current;

        return {
          ...current,
          error: "Worker dispatch failed.",
          finishedAtMs,
          status: "failed",
          updatedAtMs: finishedAtMs,
        };
      });

      response.status(503).json({ id: job.id, data: failedJob });
      return;
    }

    response
      .location(`/inference-jobs/${job.id}`)
      .status(202)
      .json(job);
  });

  app.get("/inference-jobs/:id", async (request, response) => {
    const parsedId = inferenceJobIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      response.status(400).json({
        error: { code: "invalid_request", message: "Invalid inference job ID." },
      });
      return;
    }

    const job = await inferenceJobs.get(parsedId.data);
    if (!job) {
      response.status(404).json({
        error: { code: "not_found", message: "Inference job not found." },
      });
      return;
    }

    response.status(200).json(job);
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({
        error: { code: "invalid_request", message: "Request body must be valid JSON." },
      });
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 413
    ) {
      response.status(413).json({
        error: { code: "request_too_large", message: "Request body is too large." },
      });
      return;
    }

    logger.error("Unhandled API error.", error);
    response.status(500).json({
      error: { code: "internal_error", message: "An unexpected error occurred." },
    });
  };

  app.use(errorHandler);

  return app;
}
