import { describe, expect, it, vi } from "vitest";

import { graphPlanSchema, recipeFactsSchema } from "../../src/ingestion/contracts.js";
import { ingestRecipe } from "../../src/ingestion/ingest-recipe.js";

vi.hoisted(() => {
  process.env.FIRESTORE_DATABASE_ID = "worker-test";
});

const facts = recipeFactsSchema.parse({
  author: null,
  ingredients: [
    {
      key: "salt",
      name: "Salt",
      notes: [],
      optional: false,
      quantity: { kind: "as-needed", unit: null },
    },
  ],
  instructions: ["Add salt and serve."],
  title: "Salt",
  yield: { quantity: null, unit: null },
});

const plan = graphPlanSchema.parse({
  cookTasks: [
    {
      actionType: "serve",
      completion: null,
      duration: null,
      inputs: [{ prepTaskKey: "prep-salt", type: "prepObject" }],
      instruction: "Serve the salt.",
      key: "serve-salt",
      output: { label: "Salt", locationToolKey: null },
      tools: [],
    },
  ],
  finalCookTaskKey: "serve-salt",
  prepTasks: [
    {
      actionType: "measure",
      inputs: [{ allocation: { kind: "all" }, ingredientKey: "salt", type: "ingredient" }],
      instruction: "Set out the salt.",
      key: "prep-salt",
      output: { label: "Salt", locationToolKey: null },
      tools: [],
    },
  ],
  tools: [],
});

describe("ingestRecipe", () => {
  it("runs fact extraction and graph planning before deterministic compilation", async () => {
    const model = {
      dispose: async () => {},
      generate: vi.fn(async ({ schema }) => {
        if (schema === recipeFactsSchema) return facts;
        if (schema === graphPlanSchema) return plan;
        throw new Error("unexpected model stage");
      }),
    };

    const result = await ingestRecipe({ catalog: [], input: "Salt as needed. Serve.", model });

    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(result.newIngredients).toHaveLength(1);
    expect(result.recipe.cook.finalOutputId).toBe("cook-output-1");
  });

  it("repairs one graph plan rejected by deterministic compilation", async () => {
    const invalidPlan = graphPlanSchema.parse({
      ...plan,
      cookTasks: [
        {
          ...plan.cookTasks[0],
          inputs: [{ prepTaskKey: "missing-prep-task", type: "prepObject" }],
        },
      ],
    });
    let graphPlans = 0;
    const model = {
      dispose: async () => {},
      generate: vi.fn(async ({ schema }) => {
        if (schema === recipeFactsSchema) return facts;
        if (schema === graphPlanSchema) return graphPlans++ === 0 ? invalidPlan : plan;
        throw new Error("unexpected model stage");
      }),
    };

    await expect(ingestRecipe({ catalog: [], input: "Salt as needed. Serve.", model })).resolves.toMatchObject({
      recipe: { cook: { finalOutputId: "cook-output-1" } },
    });
    expect(model.generate).toHaveBeenCalledTimes(3);
  });
});
