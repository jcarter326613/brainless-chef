import { performance } from "node:perf_hooks";

import type { Ingredient, Recipe } from "@brainless-chef/database";

import { compileRecipe } from "./compile-recipe.js";
import { type GraphPlan, type RecipeFacts } from "./contracts.js";
import { extractRecipeFacts } from "./extract-facts.js";
import type { StructuredModel } from "./model.js";
import { planRecipeGraph, repairRecipeGraph } from "./plan-graph.js";
import {
  resolveIngredients,
  type CatalogIngredient,
  type IngredientResolution,
} from "./resolve-ingredients.js";

export interface IngestedRecipe {
  newIngredients: Array<{ data: Ingredient; id: string }>;
  recipe: Recipe;
}

export type IngestionStage = "facts" | "catalog-resolution" | "graph-plan" | "graph-repair" | "recipe";

export interface IngestionObserver {
  onStage(
    stage: IngestionStage,
    data: RecipeFacts | IngredientResolution | GraphPlan | Recipe,
    elapsedMs: number,
  ): void;
}

export async function ingestRecipe({
  catalog,
  input,
  model,
  observer,
}: {
  catalog: readonly CatalogIngredient[];
  input: string;
  model: StructuredModel;
  observer?: IngestionObserver;
}): Promise<IngestedRecipe> {
  const report = <Data extends RecipeFacts | IngredientResolution | GraphPlan | Recipe>(
    stage: IngestionStage,
    startedAt: number,
    data: Data,
  ) => observer?.onStage(stage, data, Math.round(performance.now() - startedAt));

  const factsStartedAt = performance.now();
  const facts = await extractRecipeFacts(model, input);
  report("facts", factsStartedAt, facts);

  const resolutionStartedAt = performance.now();
  const { ingredientIds, newIngredients } = await resolveIngredients(model, facts, catalog);
  report("catalog-resolution", resolutionStartedAt, { ingredientIds, newIngredients });

  const planStartedAt = performance.now();
  const plan = await planRecipeGraph(model, facts);
  report("graph-plan", planStartedAt, plan);

  try {
    const compilationStartedAt = performance.now();
    const recipe = compileRecipe({ facts, ingredientIds, plan });
    report("recipe", compilationStartedAt, recipe);
    return {
      newIngredients,
      recipe,
    };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const repairStartedAt = performance.now();
    const repairedPlan = await repairRecipeGraph(model, facts, plan, error);
    report("graph-repair", repairStartedAt, repairedPlan);
    const compilationStartedAt = performance.now();
    const recipe = compileRecipe({ facts, ingredientIds, plan: repairedPlan });
    report("recipe", compilationStartedAt, recipe);
    return {
      newIngredients,
      recipe,
    };
  }
}
