import { describe, expect, it } from "vitest";

import { createPartialRecipe } from "../src/step-final.js";

describe("createPartialRecipe", () => {
  it("creates source-ordered recipe ingredients with temporary catalog IDs", () => {
    const recipe = createPartialRecipe({
      ingredientGroups: [
        {
          component: { name: "Cake", type: "noun" },
          ingredients: [
            {
              name: "flour",
              notes: ["all-purpose"],
              optional: false,
              quantity: { kind: "exact", packageSize: null, unit: "cup", value: 2 },
            },
          ],
        },
        {
          component: { name: "Glaze", type: "optional noun" },
          ingredients: [
            {
              name: "milk",
              notes: [],
              optional: true,
              quantity: { kind: "exact", packageSize: null, unit: "tsp", value: 4 },
            },
          ],
        },
      ],
    });

    expect(recipe).toEqual({
      ingredientCatalog: [
        { name: "flour" },
        { name: "milk" },
      ],
      ingredients: [
        {
          id: "ingredients-0",
          notes: ["all-purpose"],
          optional: false,
          quantity: { kind: "exact", packageSize: null, unit: "cup", value: 2 },
        },
        {
          id: "ingredients-1",
          notes: [],
          optional: true,
          quantity: { kind: "exact", packageSize: null, unit: "tsp", value: 4 },
        },
      ],
    });
  });

  it("deduplicates catalog ingredients while retaining source recipe ingredients", () => {
    const recipe = createPartialRecipe({
      ingredientGroups: [
        {
          component: null,
          ingredients: [
            {
              name: "flour",
              notes: [],
              optional: false,
              quantity: { kind: "exact", packageSize: null, unit: "cup", value: 1 },
            },
            {
              name: "flour",
              notes: ["sifted"],
              optional: false,
              quantity: { kind: "exact", packageSize: null, unit: "cup", value: 2 },
            },
          ],
        },
      ],
    });

    expect(recipe).toEqual({
      ingredientCatalog: [{ name: "flour" }],
      ingredients: [
        {
          id: "ingredients-0",
          notes: [],
          optional: false,
          quantity: { kind: "exact", packageSize: null, unit: "cup", value: 1 },
        },
        {
          id: "ingredients-0",
          notes: ["sifted"],
          optional: false,
          quantity: { kind: "exact", packageSize: null, unit: "cup", value: 2 },
        },
      ],
    });
  });

  it("returns an empty ingredient collection when no ingredients were extracted", () => {
    expect(createPartialRecipe({ ingredientGroups: [] })).toEqual({ ingredientCatalog: [], ingredients: [] });
  });
});
