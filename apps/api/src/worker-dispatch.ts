import { v2 } from "@google-cloud/run";

export function createWorkerDispatcher(
  workerJobName: string | undefined,
  jobsClient: Pick<v2.JobsClient, "runJob"> = new v2.JobsClient(),
) {
  return async (jobId: string) => {
    if (!workerJobName) {
      throw new Error("WORKER_JOB_NAME must be configured to dispatch inference jobs.");
    }

    await jobsClient.runJob(
      {
        name: workerJobName,
        overrides: {
          containerOverrides: [
            {
              env: [{ name: "JOB_ID", value: jobId }],
              name: "worker",
            },
          ],
        },
      },
      { timeout: 15_000 },
    );
  };
}
