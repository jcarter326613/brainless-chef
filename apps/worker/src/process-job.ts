import type { InferenceJob } from "@brainless-chef/database";

interface StoredInferenceJob {
  data: InferenceJob;
  id: string;
}

interface InferenceJobCollection {
  get(id: string): Promise<StoredInferenceJob | undefined>;
  update(id: string, updater: (current: InferenceJob) => InferenceJob): Promise<InferenceJob>;
}

export interface InferenceDatabase {
  collections: {
    inferenceJobs: InferenceJobCollection;
  };
  transaction<Result>(
    operation: (database: {
      collections: { inferenceJobs: InferenceJobCollection };
    }) => Promise<Result>,
  ): Promise<Result>;
}

export interface ProcessJobDependencies {
  database: InferenceDatabase;
  infer(input: string): Promise<string>;
  logger?: Pick<Console, "error" | "info">;
  now?: () => number;
}

export async function processJob(
  jobId: string,
  { database, infer, logger = console, now = Date.now }: ProcessJobDependencies,
): Promise<boolean> {
  const claimed = await database.transaction(async ({ collections }) => {
    const existing = await collections.inferenceJobs.get(jobId);
    if (!existing || existing.data.status !== "queued") return undefined;

    const startedAtMs = Math.max(now(), existing.data.createdAtMs);
    const data = await collections.inferenceJobs.update(jobId, (current) => {
      if (current.status !== "queued") {
        throw new Error(`Inference job ${jobId} was claimed by another execution.`);
      }

      return {
        ...current,
        startedAtMs,
        status: "running",
        updatedAtMs: startedAtMs,
      };
    });

    return { data, id: jobId };
  });

  if (!claimed) {
    logger.info(`Inference job ${jobId} is missing or no longer queued.`);
    return false;
  }

  try {
    const output = await infer(claimed.data.input);
    if (output.trim() === "") throw new Error("The model returned empty output.");

    const finishedAtMs = Math.max(now(), claimed.data.startedAtMs ?? claimed.data.createdAtMs);
    await database.collections.inferenceJobs.update(jobId, (current) => {
      if (current.status !== "running") {
        throw new Error(`Inference job ${jobId} is no longer running.`);
      }

      return {
        ...current,
        finishedAtMs,
        output,
        status: "succeeded",
        updatedAtMs: finishedAtMs,
      };
    });
    return true;
  } catch (error) {
    logger.error(`Inference job ${jobId} failed.`, error);
    const finishedAtMs = Math.max(now(), claimed.data.startedAtMs ?? claimed.data.createdAtMs);

    await database.collections.inferenceJobs.update(jobId, (current) => {
      if (current.status !== "running") return current;

      return {
        ...current,
        error: "Recipe inference failed.",
        finishedAtMs,
        output: "",
        status: "failed",
        updatedAtMs: finishedAtMs,
      };
    });

    throw error;
  }
}
