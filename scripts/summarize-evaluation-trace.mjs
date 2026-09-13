import { existsSync, readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) throw new Error("Usage: summarize-evaluation-trace <trace.ndjson>");

if (!existsSync(path)) {
  console.log("No evaluation trace was written.");
  process.exit(0);
}

const events = readFileSync(path, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

for (const event of events) {
  const stage = event.stage ? ` [${event.stage}]` : "";
  const elapsed = event.elapsedMs === undefined ? "" : ` (${event.elapsedMs}ms)`;
  if (event.kind === "model-started") {
    console.log(`model started${stage}: ${event.data.requestTokens} input tokens, ${event.data.maxOutputTokens} output tokens`);
    continue;
  }
  if (event.kind === "model-completed") {
    console.log(`model completed${stage}${elapsed}`);
    continue;
  }
  if (event.kind === "model-failed") {
    console.log(`model failed${stage}${elapsed}: ${event.error.message}`);
    continue;
  }
  if (event.kind === "stage-completed") {
    console.log(`stage completed${stage}${elapsed}`);
    continue;
  }
  if (event.kind === "compilation-failed") {
    console.log(`compilation failed: ${event.error.message}`);
    continue;
  }
  if (event.kind === "evaluation-case-passed" || event.kind === "evaluation-case-failed") {
    console.log(`${event.kind.replace("evaluation-case-", "evaluation case ")}${stage}`);
  }
}
