import { performance } from "node:perf_hooks";

import { inferRecipe } from "./infer.js";

const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for the benchmark.");

const input =
  process.env.BENCHMARK_INPUT ??
  "Quick flatbread: Mix 1 cup flour, 1/2 cup water, and 1 teaspoon salt. Knead, roll thin, and cook in a hot dry pan for 2 minutes per side.";
const startedAt = performance.now();
const output = await inferRecipe(input, modelPath);

console.log(
  JSON.stringify({
    elapsedMs: Math.round(performance.now() - startedAt),
    output: JSON.parse(output),
  }),
);
