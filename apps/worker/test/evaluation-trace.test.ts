import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createEvaluationTracer, writeEvaluationReport } from "../src/evaluation-trace.js";

describe("evaluation tracing", () => {
  it("writes incremental events and a final report", async () => {
    const directory = await mkdtemp(join(tmpdir(), "brainless-chef-trace-"));
    const tracePath = join(directory, "trace.ndjson");
    const reportPath = join(directory, "report.json");

    try {
      const tracer = createEvaluationTracer(tracePath);
      tracer.write({ data: { rawOutput: "{}" }, kind: "model-failed", stage: "facts" });
      writeEvaluationReport(reportPath, { cases: [{ name: "example", status: "failed" }] });

      const [trace, report] = await Promise.all([readFile(tracePath, "utf8"), readFile(reportPath, "utf8")]);
      expect(JSON.parse(trace)).toMatchObject({ data: { rawOutput: "{}" }, kind: "model-failed", stage: "facts" });
      expect(JSON.parse(report)).toEqual({ cases: [{ name: "example", status: "failed" }] });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
