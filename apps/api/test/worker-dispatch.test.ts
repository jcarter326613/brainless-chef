import { describe, expect, it, vi } from "vitest";

import { createWorkerDispatcher } from "../src/worker-dispatch.js";

describe("createWorkerDispatcher", () => {
  it("starts the configured worker with only the job ID override", async () => {
    const runJob = vi.fn().mockResolvedValue([{}]);
    const dispatch = createWorkerDispatcher(
      "projects/project/locations/us-east1/jobs/worker",
      { runJob } as never,
    );

    await dispatch("job-1");

    expect(runJob).toHaveBeenCalledWith(
      {
        name: "projects/project/locations/us-east1/jobs/worker",
        overrides: {
          containerOverrides: [
            {
              env: [{ name: "JOB_ID", value: "job-1" }],
              name: "worker",
            },
          ],
        },
      },
      { timeout: 15_000 },
    );
  });

  it("fails without a configured worker job", async () => {
    const runJob = vi.fn();

    await expect(createWorkerDispatcher(undefined, { runJob } as never)("job-1")).rejects.toThrow(
      "WORKER_JOB_NAME",
    );
    expect(runJob).not.toHaveBeenCalled();
  });
});
