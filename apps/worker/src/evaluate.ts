import assert from "node:assert/strict";

import { createRecipeInferer, type RecipeDraft } from "./infer.js";

const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for evaluation.");

interface EvaluationCase {
  name: string;
  input: string;
  expectedIngredients: RecipeDraft["ingredients"];
  expectedInstructionCount: number;
  expectedInstructionPatterns: RegExp[];
}

const evaluationCases: EvaluationCase[] = [
  {
    name: "adds a water measurement from ingredients to instructions",
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
    expectedIngredients: [
      { name: "flour", quantity: 1, unit: "cup" },
      { name: "salt", quantity: 1, unit: "teaspoon" },
    ],
    expectedInstructionCount: 4,
    expectedInstructionPatterns: [/\b1\/2 cup(?: of)? water\b/],
  },
  {
    name: "keeps an existing water measurement out of ingredients",
    input: `Quick flatbread

Ingredients:
- 1 cup flour
- 1 teaspoon salt

Instructions:
1. Mix the flour, 1/2 cup water, and salt into a dough.
2. Knead for 3 minutes.
3. Roll the dough thin.
4. Cook in a hot dry pan for 2 minutes per side.`,
    expectedIngredients: [
      { name: "flour", quantity: 1, unit: "cup" },
      { name: "salt", quantity: 1, unit: "teaspoon" },
    ],
    expectedInstructionCount: 4,
    expectedInstructionPatterns: [/\b1\/2 cup(?: of)? water\b/],
  },
  {
    name: "preserves a plural water measurement in instructions",
    input: `Honey water

Ingredients:
- 2 cups water
- 1 teaspoon honey

Instructions:
1. Boil the water.
2. Stir in the honey.`,
    expectedIngredients: [
      { name: "honey", quantity: 1, unit: "teaspoon" },
    ],
    expectedInstructionCount: 2,
    expectedInstructionPatterns: [/\b2 cups?(?: of)? water\b/],
  },
];

const inferer = await createRecipeInferer(modelPath);
try {
  for (const evaluation of evaluationCases) {
    const output = JSON.parse(await inferer.infer(evaluation.input)) as RecipeDraft;

    assert.deepEqual(output.ingredients, evaluation.expectedIngredients, evaluation.name);
    assert.equal(output.instructions.length, evaluation.expectedInstructionCount, evaluation.name);
    for (const pattern of evaluation.expectedInstructionPatterns) {
      assert.ok(output.instructions.some((instruction) => pattern.test(instruction)), `${evaluation.name}: ${pattern}`);
    }

    console.log(JSON.stringify({ name: evaluation.name, output }));
  }
} finally {
  await inferer.dispose();
}
