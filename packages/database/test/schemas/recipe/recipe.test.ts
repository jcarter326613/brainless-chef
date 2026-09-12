import { describe, expect, it } from "vitest";

import { recipeSchema } from "../../../src/schemas/index.js";

const recipe = {
  ingredients: [
    {
      id: "flour",
      quantity: {
        unit: "grams",
        value: 500,
      },
    },
  ],
  instructions: [
    {
      ingredientIds: ["flour"],
      text: "Mix the flour with water.",
    },
    {
      ingredientIds: ["flour"],
      text: "Knead the dough.",
    },
  ],
  title: "Bread",
};

describe("recipeSchema", () => {
  it("allows an ingredient to be used by multiple ordered instructions", () => {
    expect(recipeSchema.parse(recipe)).toEqual(recipe);
  });

  it("normalizes units to lowercase", () => {
    expect(
      recipeSchema.parse({
        ...recipe,
        ingredients: [
          {
            ...recipe.ingredients[0],
            quantity: {
              ...recipe.ingredients[0].quantity,
              unit: "TABLESPOONS",
            },
          },
        ],
      }),
    ).toMatchObject({
      ingredients: [{ quantity: { unit: "tablespoons" } }],
    });
  });

  it.each([0, -1, Infinity, Number.NaN])(
    "rejects non-positive or invalid quantities (%s)",
    (value) => {
      const result = recipeSchema.safeParse({
        ...recipe,
        ingredients: [
          {
            ...recipe.ingredients[0],
            quantity: {
              ...recipe.ingredients[0].quantity,
              value,
            },
          },
        ],
      });

      expect(result.success).toBe(false);
    },
  );

  it.each(["", "   "])("rejects an empty unit (%s)", (unit) => {
    const result = recipeSchema.safeParse({
      ...recipe,
      ingredients: [
        {
          ...recipe.ingredients[0],
          quantity: {
            ...recipe.ingredients[0].quantity,
            unit,
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects duplicate recipe ingredient IDs", () => {
    const result = recipeSchema.safeParse({
      ...recipe,
      ingredients: [...recipe.ingredients, recipe.ingredients[0]],
    });

    expect(result.success).toBe(false);
  });

  it("rejects instruction references to ingredients outside the recipe", () => {
    const result = recipeSchema.safeParse({
      ...recipe,
      instructions: [
        {
          ...recipe.instructions[0],
          ingredientIds: ["yeast"],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects recipe ingredients that no instruction uses", () => {
    const result = recipeSchema.safeParse({
      ...recipe,
      ingredients: [
        ...recipe.ingredients,
        {
          id: "yeast",
          quantity: {
            unit: "grams",
            value: 7,
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
