import { describe, expect, it } from "vitest";

import { recipeSchema } from "../../../src/schemas/index.js";

const recipe = {
  cook: {
    finalOutputId: "cook-output-final",
    tasks: [
      {
        action: { type: "saute" },
        completion: "until the onions are soft and translucent",
        duration: {
          attention: "occasional",
          maxSeconds: 420,
          minSeconds: 300,
          timerRecommended: true,
        },
        id: "cook-onion",
        inputs: [{ id: "prep-object-onion", type: "prepObject" }],
        instruction: "Cook Bowl B until the onions are soft and translucent.",
        output: {
          id: "cook-output-onions",
          label: "Softened onions",
          locationToolId: "tool-skillet",
        },
        tools: ["tool-skillet", "tool-wooden-spoon"],
      },
      {
        action: { type: "add" },
        completion: null,
        duration: {
          attention: "active",
          maxSeconds: 30,
          minSeconds: 30,
          timerRecommended: false,
        },
        id: "cook-spices",
        inputs: [
          { id: "cook-output-onions", type: "cookOutput" },
          { id: "prep-object-spices", type: "prepObject" },
        ],
        instruction: "Add Bowl A and stir for 30 seconds.",
        output: {
          id: "cook-output-final",
          label: "Spiced onions",
          locationToolId: "tool-skillet",
        },
        tools: ["tool-skillet", "tool-wooden-spoon"],
      },
    ],
  },
  ingredients: [
    {
      id: "ingredient-onion",
      notes: [],
      optional: false,
      quantity: { kind: "exact", packageSize: null, unit: "each", value: 1 },
    },
    {
      id: "ingredient-cumin",
      notes: [],
      optional: false,
      quantity: { kind: "exact", packageSize: null, unit: "tsp", value: 1 },
    },
  ],
  prep: {
    tasks: [
      {
        action: { type: "dice" },
        id: "prep-dice-onion",
        inputs: [
          {
            id: "ingredient-onion",
            quantity: { kind: "exact", unit: "each", value: 1 },
            type: "ingredient",
          },
        ],
        instruction: "Dice the onion and place it in Bowl B.",
        output: {
          id: "prep-object-onion",
          label: "Diced onion",
          locationToolId: "tool-bowl-b",
        },
        tools: ["tool-chef-knife", "tool-cutting-board", "tool-bowl-b"],
      },
      {
        action: { type: "measure" },
        id: "prep-measure-cumin",
        inputs: [
          {
            id: "ingredient-cumin",
            quantity: { kind: "exact", unit: "tsp", value: 1 },
            type: "ingredient",
          },
        ],
        instruction: "Measure 1 teaspoon cumin.",
        output: {
          id: "prep-object-cumin",
          label: "Measured cumin",
          locationToolId: null,
        },
        tools: ["tool-measuring-spoons"],
      },
      {
        action: { type: "combine" },
        id: "prep-combine-spices",
        inputs: [{ id: "prep-object-cumin", type: "prepObject" }],
        instruction: "Combine the cumin in Bowl A.",
        output: {
          id: "prep-object-spices",
          label: "Spice mix",
          locationToolId: "tool-bowl-a",
        },
        tools: ["tool-bowl-a"],
      },
    ],
  },
  schemaVersion: "1.0",
  source: {
    author: null,
    title: "Spiced Onions",
    type: "url",
    url: "https://example.com/spiced-onions",
  },
  title: "Spiced Onions",
  tools: [
    { id: "tool-chef-knife", label: null, name: "Chef's knife", type: "knife" },
    { id: "tool-cutting-board", label: null, name: "Cutting board", type: "cutting-board" },
    { id: "tool-measuring-spoons", label: null, name: "Measuring spoons", type: "measuring-spoons" },
    { id: "tool-bowl-a", label: "Bowl A", name: "Small prep bowl", type: "bowl" },
    { id: "tool-bowl-b", label: "Bowl B", name: "Medium prep bowl", type: "bowl" },
    { id: "tool-skillet", label: null, name: "12-inch skillet", type: "skillet" },
    { id: "tool-wooden-spoon", label: null, name: "Wooden spoon", type: "spoon" },
  ],
  yield: { quantity: 4, unit: "servings" },
};

describe("recipeSchema", () => {
  it("accepts a recipe whose tasks pass prep objects into prep and cook tasks", () => {
    expect(recipeSchema.parse(recipe)).toEqual(recipe);
  });

  it("normalizes units to lowercase", () => {
    const parsed = recipeSchema.parse({
      ...recipe,
      ingredients: [
        {
          ...recipe.ingredients[0],
          quantity: { ...recipe.ingredients[0].quantity, unit: "EACH" },
        },
        {
          ...recipe.ingredients[1],
          quantity: { ...recipe.ingredients[1].quantity, unit: "TSP" },
        },
      ],
      prep: {
        ...recipe.prep,
        tasks: recipe.prep.tasks.map((task) => ({
          ...task,
          inputs: task.inputs.map((input) =>
            input.type === "ingredient" && input.quantity !== null
              ? { ...input, quantity: { ...input.quantity, unit: input.quantity.unit.toUpperCase() } }
              : input,
          ),
        })),
      },
    });

    expect(parsed.ingredients[1].quantity).toMatchObject({ unit: "tsp" });
  });

  it.each([
    [
      "a raw ingredient cook input",
      {
        ...recipe,
        cook: {
          ...recipe.cook,
          tasks: [
            {
              ...recipe.cook.tasks[0],
              inputs: [{ id: "ingredient-onion", type: "ingredient" }],
            },
            ...recipe.cook.tasks.slice(1),
          ],
        },
      },
    ],
    [
      "a cyclic cook output graph",
      {
        ...recipe,
        cook: {
          ...recipe.cook,
          tasks: [
            {
              ...recipe.cook.tasks[0],
              inputs: [
                ...recipe.cook.tasks[0].inputs,
                { id: "cook-output-final", type: "cookOutput" },
              ],
            },
            ...recipe.cook.tasks.slice(1),
          ],
        },
      },
    ],
    [
      "a cyclic prep object graph",
      {
        ...recipe,
        prep: {
          ...recipe.prep,
          tasks: [
            recipe.prep.tasks[0],
            {
              ...recipe.prep.tasks[1],
              inputs: [
                ...recipe.prep.tasks[1].inputs,
                { id: "prep-object-spices", type: "prepObject" },
              ],
            },
            ...recipe.prep.tasks.slice(2),
          ],
        },
      },
    ],
    [
      "an unknown prep object",
      {
        ...recipe,
        cook: {
          ...recipe.cook,
          tasks: [
            { ...recipe.cook.tasks[0], inputs: [{ id: "prep-object-missing", type: "prepObject" }] },
            ...recipe.cook.tasks.slice(1),
          ],
        },
      },
    ],
    [
      "a prep object consumed twice",
      {
        ...recipe,
        cook: {
          ...recipe.cook,
          tasks: [
            recipe.cook.tasks[0],
            {
              ...recipe.cook.tasks[1],
              inputs: [...recipe.cook.tasks[1].inputs, { id: "prep-object-onion", type: "prepObject" }],
            },
          ],
        },
      },
    ],
    [
      "an unconsumed prep object",
      {
        ...recipe,
        cook: {
          ...recipe.cook,
          tasks: [
            { ...recipe.cook.tasks[0], inputs: [] },
            ...recipe.cook.tasks.slice(1),
          ],
        },
      },
    ],
    [
      "an unreconciled ingredient allocation",
      {
        ...recipe,
        prep: {
          ...recipe.prep,
          tasks: [
            {
              ...recipe.prep.tasks[0],
              inputs: [
                {
                  ...recipe.prep.tasks[0].inputs[0],
                  quantity: { kind: "exact", unit: "each", value: 0.5 },
                },
              ],
            },
            ...recipe.prep.tasks.slice(1),
          ],
        },
      },
    ],
    [
      "a missing task tool",
      {
        ...recipe,
        cook: {
          ...recipe.cook,
          tasks: [
            { ...recipe.cook.tasks[0], tools: ["tool-missing"] },
            ...recipe.cook.tasks.slice(1),
          ],
        },
      },
    ],
    ["a missing final output", { ...recipe, cook: { ...recipe.cook, finalOutputId: "cook-output-missing" } }],
  ])("rejects %s", (_description, invalidRecipe) => {
    expect(recipeSchema.safeParse(invalidRecipe).success).toBe(false);
  });
});
