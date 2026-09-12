import { describe, expect, it, vi } from "vitest";

import { recipeFactsSchema } from "../../src/ingestion/contracts.js";
import { resolveIngredients } from "../../src/ingestion/resolve-ingredients.js";

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
  instructions: ["Mix flour."],
  title: "Flour",
  yield: { quantity: null, unit: null },
});

describe("resolveIngredients", () => {
  it("reuses an exact catalog match without invoking the model", async () => {
    const model = { generate: async () => { throw new Error("model should not run"); }, dispose: async () => {} };

    await expect(
      resolveIngredients(model, facts, [{ data: { name: " flour " }, id: "ingredient-existing" }]),
    ).resolves.toMatchObject({ ingredientIds: new Map([["flour", "ingredient-existing"]]), newIngredients: [] });
  });

  it("creates a deterministic catalog ID when the catalog is empty", async () => {
    const model = { generate: async () => { throw new Error("model should not run"); }, dispose: async () => {} };

    const result = await resolveIngredients(model, facts, []);

    expect(result.ingredientIds.get("flour")).toMatch(/^ingredient-[a-f0-9]{24}$/);
    expect(result.newIngredients).toEqual([{ data: { name: "Flour" }, id: result.ingredientIds.get("flour") }]);
  });

  it("accepts a model-selected semantic candidate from the bounded candidate list", async () => {
    const scallionFacts = recipeFactsSchema.parse({
      ...facts,
      ingredients: [{ ...facts.ingredients[0], key: "scallion", name: "Scallion" }],
    });
    const model = {
      dispose: async () => {},
      generate: async () => ({ matches: [{ candidateId: "ingredient-green-onion", ingredientKey: "scallion" }] }),
    };

    await expect(
      resolveIngredients(model, scallionFacts, [{ data: { name: "Green onion" }, id: "ingredient-green-onion" }]),
    ).resolves.toMatchObject({
      ingredientIds: new Map([["scallion", "ingredient-green-onion"]]),
      newIngredients: [],
    });
  });
});
