import { database } from "@brainless-chef/database";

import { createApp } from "./app.js";
import { createWorkerDispatcher } from "./worker-dispatch.js";

const port = Number(process.env.PORT ?? 8080);
const app = createApp({
  dispatchWorker: createWorkerDispatcher(process.env.WORKER_JOB_NAME),
  inferenceJobs: database.collections.inferenceJobs,
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on port ${port}`);
});
