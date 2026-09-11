import assert from "node:assert/strict";

import { inferRecipe } from "./infer.js";

const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for evaluation.");

const input = `Quick flatbread

Ingredients:
- 1 cup flour
- 1/2 cup water
- 1 teaspoon salt

Instructions:
1. Mix the flour, water, and salt into a dough.
2. Knead for 3 minutes.
3. Roll the dough thin.
4. Cook in a hot dry pan for 2 minutes per side.`;

const output = JSON.parse(await inferRecipe(input, modelPath));
const ingredient = (name: string) => output.ingredients.find((item: { name: string }) => item.name === name);

assert.deepEqual(ingredient("flour"), { name: "flour", quantity: 1, unit: "cup" });
assert.deepEqual(ingredient("water"), { name: "water", quantity: 0.5, unit: "cup" });
assert.deepEqual(ingredient("salt"), { name: "salt", quantity: 1, unit: "teaspoon" });
assert.equal(output.instructions.length, 4);

console.log(JSON.stringify(output));
