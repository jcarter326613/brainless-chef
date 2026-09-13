import assert from "node:assert/strict";

import { createEvaluationTracer, writeEvaluationReport } from "./evaluation-trace.js";
import { ingestRecipe } from "./ingestion/ingest-recipe.js";
import { createStructuredModel } from "./ingestion/model.js";

const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for evaluation.");

interface EvaluationCase {
  expectedIngredientNames: string[];
  input: string;
  minimumCookTasks: number;
  name: string;
}

const evaluationCases: EvaluationCase[] = [
  {
    name: "builds a flatbread material graph",
    input: `Quick flatbread

Ingredients:
- 1 cup flour
- 1/2 cup water
- 1 teaspoon salt

Instructions:
1. Mix the flour, water, and salt into a dough.
2. Knead for 3 minutes.
3. Roll the dough thin.
4. Cook in a hot dry pan for 2 minutes per side.`,
    expectedIngredientNames: ["flour", "water", "salt"],
    minimumCookTasks: 1,
  },
  {
    name: "preserves an as-needed ingredient",
    input: `Ingredients: salt as needed.
Instructions: Add salt slowly and serve.`,
    expectedIngredientNames: ["salt"],
    minimumCookTasks: 1,
  },
];

const tracer = createEvaluationTracer(process.env.EVALUATION_TRACE_PATH);
const report: Array<{ actual?: unknown; expected: Omit<EvaluationCase, "input" | "name">; name: string; status: "failed" | "passed" }> = [];
const serializeStage = (data: unknown) =>
  typeof data === "object" && data !== null && "ingredientIds" in data
    ? { ...data, ingredientIds: Object.fromEntries((data as { ingredientIds: Map<string, string> }).ingredientIds) }
    : data;
const model = await createStructuredModel(modelPath, { onTrace: (event) => tracer.write(event) });
try {
  for (const evaluation of evaluationCases) {
    const expected = {
      expectedIngredientNames: evaluation.expectedIngredientNames,
      minimumCookTasks: evaluation.minimumCookTasks,
    };
    tracer.write({ data: { expected }, kind: "evaluation-case-started", stage: evaluation.name });
    try {
      const result = await ingestRecipe({
        catalog: [],
        input: evaluation.input,
        model,
        observer: {
          onCompilationFailure(plan, error) {
            tracer.write({ data: { plan }, error: { message: error.message }, kind: "compilation-failed" });
          },
          onStage(stage, data, elapsedMs) {
            tracer.write({ data: serializeStage(data), elapsedMs, kind: "stage-completed", stage });
          },
        },
      });
      const ingredientNames = result.newIngredients.map((ingredient) => ingredient.data.name.toLowerCase());
      const actual = { ingredientNames, recipe: result.recipe };

      assert.deepEqual(ingredientNames, evaluation.expectedIngredientNames, evaluation.name);
      assert.ok(result.recipe.cook.tasks.length >= evaluation.minimumCookTasks, evaluation.name);
      report.push({ actual, expected, name: evaluation.name, status: "passed" });
      tracer.write({ data: { actual, expected }, kind: "evaluation-case-passed", stage: evaluation.name });
      console.log(JSON.stringify({ name: evaluation.name, recipe: result.recipe }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.push({ expected, name: evaluation.name, status: "failed" });
      tracer.write({ error: { message }, kind: "evaluation-case-failed", stage: evaluation.name });
      throw error;
    }
  }
} finally {
  await model.dispose();
  writeEvaluationReport(process.env.EVALUATION_REPORT_PATH, { cases: report });
}
