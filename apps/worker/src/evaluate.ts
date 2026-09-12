import assert from "node:assert/strict";

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

const model = await createStructuredModel(modelPath);
try {
  for (const evaluation of evaluationCases) {
    const result = await ingestRecipe({ catalog: [], input: evaluation.input, model });
    const ingredientNames = result.newIngredients.map((ingredient) => ingredient.data.name.toLowerCase());

    console.log(JSON.stringify({ name: evaluation.name, recipe: result.recipe }));

    assert.deepEqual(ingredientNames, evaluation.expectedIngredientNames, evaluation.name);
    assert.ok(result.recipe.cook.tasks.length >= evaluation.minimumCookTasks, evaluation.name);
  }
} finally {
  await model.dispose();
}
