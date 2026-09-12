import type { Ingredient, Recipe } from "@brainless-chef/database";

import { compileRecipe } from "./compile-recipe.js";
import { extractRecipeFacts } from "./extract-facts.js";
import type { StructuredModel } from "./model.js";
import { planRecipeGraph, repairRecipeGraph } from "./plan-graph.js";
import { resolveIngredients, type CatalogIngredient } from "./resolve-ingredients.js";

export interface IngestedRecipe {
  newIngredients: Array<{ data: Ingredient; id: string }>;
  recipe: Recipe;
}

export async function ingestRecipe({
  catalog,
  input,
  model,
}: {
  catalog: readonly CatalogIngredient[];
  input: string;
  model: StructuredModel;
}): Promise<IngestedRecipe> {
  const facts = await extractRecipeFacts(model, input);
  const { ingredientIds, newIngredients } = await resolveIngredients(model, facts, catalog);
  const plan = await planRecipeGraph(model, facts);

  try {
    return {
      newIngredients,
      recipe: compileRecipe({ facts, ingredientIds, plan }),
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const repairedPlan = await repairRecipeGraph(model, facts, plan, error);
    return {
      newIngredients,
      recipe: compileRecipe({ facts, ingredientIds, plan: repairedPlan }),
    };
  }
}
