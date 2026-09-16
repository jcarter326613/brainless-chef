import {
  ingredientSchema,
  recipeIngredientSchema,
  type Ingredient,
  type Recipe,
} from "@brainless-chef/database/schemas";

import type { IngredientExtractionResult } from "./step-3-extract-ingredients.js";

export type PartialRecipe = Pick<Recipe, "ingredients"> & { ingredientCatalog: Ingredient[] };

export function createPartialRecipe({ ingredientGroups }: Pick<IngredientExtractionResult, "ingredientGroups">): PartialRecipe {
  const ingredientCatalog: Ingredient[] = [];
  const catalogIndexes = new Map<string, number>();

  return {
    ingredientCatalog,
    ingredients: ingredientGroups.flatMap(({ ingredients }) =>
      ingredients.map((ingredient) => {
        let catalogIndex = catalogIndexes.get(ingredient.name);
        if (catalogIndex === undefined) {
          catalogIndex = ingredientCatalog.length;
          ingredientCatalog.push(ingredientSchema.parse({ name: ingredient.name }));
          catalogIndexes.set(ingredient.name, catalogIndex);
        }

        return recipeIngredientSchema.parse({
          id: `ingredients-${catalogIndex}`,
          notes: ingredient.notes,
          optional: ingredient.optional,
          quantity: ingredient.quantity,
        });
      }),
    ),
  };
}
