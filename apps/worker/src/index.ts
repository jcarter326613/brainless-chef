import { database } from "@brainless-chef/database";

import { ingestRecipe } from "./ingestion/ingest-recipe.js";
import { createStructuredModel } from "./ingestion/model.js";
import { processJob } from "./process-job.js";

const jobId = process.env.JOB_ID;
if (!jobId) throw new Error("JOB_ID must be configured for an inference execution.");

const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for inference.");

console.log(
  `Processing inference job ${jobId} in execution ${process.env.CLOUD_RUN_EXECUTION ?? "local"}.`,
);

const model = await createStructuredModel(modelPath);
try {
  await processJob(jobId, {
    database,
    ingest: (input, catalog) => ingestRecipe({ catalog, input, model }),
  });
} finally {
  await model.dispose();
}
