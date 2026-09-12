import assert from "node:assert/strict";

import { createRecipeInferer, type RecipeDraft } from "./infer.js";

const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for evaluation.");

interface EvaluationCase {
  name: string;
  input: string;
  expectedIngredients: RecipeDraft["ingredients"];
  expectedInstructionCount: number;
}

const evaluationCases: EvaluationCase[] = [
  {
    name: "extracts a flatbread recipe",
    input: `Quick flatbread

Ingredients:
- 1 cup flour
- 1/2 cup water
- 1 teaspoon salt

Instructions:
1. Mix the flour, 1/2 cup water, and salt into a dough.
2. Knead for 3 minutes.
3. Roll the dough thin.
4. Cook in a hot dry pan for 2 minutes per side.`,
    expectedIngredients: [
      { name: "flour", quantity: 1, unit: "cup" },
      { name: "water", quantity: 0.5, unit: "cup" },
      { name: "salt", quantity: 1, unit: "teaspoon" },
    ],
    expectedInstructionCount: 4,
  },
  {
    name: "extracts an unmeasured ingredient",
    input: `Ingredients: salt as needed.
Instructions: Add salt slowly.`,
    expectedIngredients: [
      { name: "salt", quantity: null, unit: null },
    ],
    expectedInstructionCount: 1,
  },
];

const inferer = await createRecipeInferer(modelPath);
try {
  for (const evaluation of evaluationCases) {
    const output = JSON.parse(await inferer.infer(evaluation.input)) as RecipeDraft;

    console.log(JSON.stringify({ name: evaluation.name, output }));

    assert.deepEqual(output.ingredients, evaluation.expectedIngredients, evaluation.name);
    assert.equal(output.instructions.length, evaluation.expectedInstructionCount, evaluation.name);
  }
} finally {
  await inferer.dispose();
}
