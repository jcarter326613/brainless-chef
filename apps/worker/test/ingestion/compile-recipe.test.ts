import { describe, expect, it, vi } from "vitest";

import { graphPlanSchema, recipeFactsSchema } from "../../src/ingestion/contracts.js";
import { compileRecipe } from "../../src/ingestion/compile-recipe.js";

vi.hoisted(() => {
  process.env.FIRESTORE_DATABASE_ID = "worker-test";
});

const facts = recipeFactsSchema.parse({
  author: null,
  ingredients: [
    {
      key: "flour",
      name: "Flour",
      notes: [],
      optional: false,
      quantity: { kind: "exact", packageSize: null, unit: "cup", value: 1 },
    },
  ],
  instructions: ["Mix the flour.", "Serve it."],
  title: "Flour",
  yield: { quantity: null, unit: null },
});

const plan = graphPlanSchema.parse({
  cookTasks: [
    {
      actionType: "serve",
      completion: null,
      duration: null,
      inputs: [{ prepTaskKey: "measure-flour", type: "prepObject" }],
      instruction: "Serve the measured flour.",
      key: "serve-flour",
      output: { label: "Flour", locationToolKey: null },
      tools: [],
    },
  ],
  finalCookTaskKey: "serve-flour",
  prepTasks: [
    {
      actionType: "measure",
      inputs: [{ allocation: { kind: "all" }, ingredientKey: "flour", type: "ingredient" }],
      instruction: "Measure the flour.",
      key: "measure-flour",
      output: { label: "Measured flour", locationToolKey: null },
      tools: [],
    },
  ],
  tools: [],
});

describe("compileRecipe", () => {
  it("assigns stable IDs and derives graph dependencies from temporary references", () => {
    const recipe = compileRecipe({
      facts,
      ingredientIds: new Map([["flour", "ingredient-flour"]]),
      plan,
    });

    expect(recipe).toMatchObject({
      cook: {
        finalOutputId: "cook-output-1",
        tasks: [{ inputs: [{ id: "prep-object-1", type: "prepObject" }] }],
      },
      ingredients: [{ id: "ingredient-flour" }],
      prep: {
        tasks: [
          {
            inputs: [{ id: "ingredient-flour", quantity: { kind: "exact", unit: "cup", value: 1 } }],
            output: { id: "prep-object-1" },
          },
        ],
      },
      schemaVersion: "1.0",
    });
  });

  it("rejects a fraction allocation for a non-exact ingredient", () => {
    const rangeFacts = recipeFactsSchema.parse({
      ...facts,
      ingredients: [
        {
          ...facts.ingredients[0],
          quantity: { kind: "range", max: 2, min: 1, unit: "cup" },
        },
      ],
    });
    const dividedPlan = graphPlanSchema.parse({
      ...plan,
      prepTasks: [
        {
          ...plan.prepTasks[0],
          inputs: [
            {
              allocation: { denominator: 2, kind: "fraction", numerator: 1 },
              ingredientKey: "flour",
              type: "ingredient",
            },
          ],
        },
      ],
    });

    expect(() =>
      compileRecipe({
        facts: rangeFacts,
        ingredientIds: new Map([["flour", "ingredient-flour"]]),
        plan: dividedPlan,
      }),
    ).toThrow("Only exact ingredient quantities");
  });

  it("rejects a final cook task that produces no material output", () => {
    const noOutputPlan = graphPlanSchema.parse({
      ...plan,
      cookTasks: [{ ...plan.cookTasks[0], output: null }],
    });

    expect(() =>
      compileRecipe({
        facts,
        ingredientIds: new Map([["flour", "ingredient-flour"]]),
        plan: noOutputPlan,
      }),
    ).toThrow("does not produce the final output");
  });
});
