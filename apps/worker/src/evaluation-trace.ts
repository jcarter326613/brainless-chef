import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface EvaluationTraceEvent {
  data?: unknown;
  elapsedMs?: number;
  error?: unknown;
  kind: string;
  stage?: string;
}

export interface EvaluationTracer {
  write(event: EvaluationTraceEvent): void;
}

export function createEvaluationTracer(path: string | undefined): EvaluationTracer {
  if (!path) return { write() {} };

  mkdirSync(dirname(path), { recursive: true });
  return {
    write(event) {
      appendFileSync(path, `${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}\n`);
    },
  };
}

export function writeEvaluationReport(path: string | undefined, report: unknown) {
  if (!path) return;

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
