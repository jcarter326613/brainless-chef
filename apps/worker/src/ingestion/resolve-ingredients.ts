import { createHash } from "node:crypto";

import type { Ingredient } from "@brainless-chef/database";

import { catalogResolutionSchema, type RecipeFacts } from "./contracts.js";
import type { StructuredModel } from "./model.js";
import { catalogResolutionPrompt } from "./prompts.js";

export interface CatalogIngredient {
  data: Ingredient;
  id: string;
}

export interface IngredientResolution {
  ingredientIds: Map<string, string>;
  newIngredients: Array<{ data: Ingredient; id: string }>;
}

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

const newIngredientId = (name: string) =>
  `ingredient-${createHash("sha256").update(normalizeName(name)).digest("hex").slice(0, 24)}`;

const candidateScore = (name: string, candidate: string) => {
  const nameTokens = new Set(normalizeName(name).split(" "));
  const candidateTokens = new Set(normalizeName(candidate).split(" "));
  return [...nameTokens].filter((token) => candidateTokens.has(token)).length;
};

export async function resolveIngredients(
  model: StructuredModel,
  facts: RecipeFacts,
  catalog: readonly CatalogIngredient[],
): Promise<IngredientResolution> {
  const catalogByNormalizedName = new Map<string, CatalogIngredient>();
  [...catalog]
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((ingredient) => {
      catalogByNormalizedName.set(normalizeName(ingredient.data.name), ingredient);
    });

  const ingredientIds = new Map<string, string>();
  const unresolved = facts.ingredients.filter((ingredient) => {
    const match = catalogByNormalizedName.get(normalizeName(ingredient.name));
    if (!match) return true;
    ingredientIds.set(ingredient.key, match.id);
    return false;
  });

  if (unresolved.length === 0) return { ingredientIds, newIngredients: [] };
  if (catalog.length === 0) {
    const newIngredients = unresolved.map((ingredient) => {
      const id = newIngredientId(ingredient.name);
      ingredientIds.set(ingredient.key, id);
      return { data: { name: ingredient.name.trim() }, id };
    });
    return { ingredientIds, newIngredients };
  }

  const candidatesByIngredient = new Map(
    unresolved.map((ingredient) => [
      ingredient.key,
      [...catalog]
        .sort((left, right) => {
          const scoreDifference = candidateScore(ingredient.name, right.data.name) - candidateScore(ingredient.name, left.data.name);
          return scoreDifference === 0 ? left.id.localeCompare(right.id) : scoreDifference;
        })
        .slice(0, 12),
    ]),
  );
  const candidates = [...new Map(
    [...candidatesByIngredient.values()].flat().map((ingredient) => [ingredient.id, ingredient]),
  ).values()].map(({ data, id }) => ({ id, name: data.name }));

  const resolution = await model.generate({
    input: JSON.stringify({
      candidates,
      ingredients: unresolved.map(({ key, name }) => ({ key, name })),
    }),
    maxOutputTokens: 1_024,
    schema: catalogResolutionSchema,
    systemPrompt: catalogResolutionPrompt,
  });
  const matchesByKey = new Map(resolution.matches.map((match) => [match.ingredientKey, match.candidateId]));
  const newIngredients: Array<{ data: Ingredient; id: string }> = [];

  unresolved.forEach((ingredient) => {
    if (!matchesByKey.has(ingredient.key)) {
      throw new Error(`The model did not resolve ingredient ${ingredient.key}.`);
    }

    const candidateId = matchesByKey.get(ingredient.key);
    const candidatesForIngredient = candidatesByIngredient.get(ingredient.key) ?? [];
    if (candidateId !== null && !candidatesForIngredient.some((candidate) => candidate.id === candidateId)) {
      throw new Error(`The model selected an invalid catalog candidate for ${ingredient.key}.`);
    }

    const id = candidateId ?? newIngredientId(ingredient.name);
    ingredientIds.set(ingredient.key, id);
    if (candidateId === null) newIngredients.push({ data: { name: ingredient.name.trim() }, id });
  });

  if (resolution.matches.length !== unresolved.length || matchesByKey.size !== unresolved.length) {
    throw new Error("The model returned an incomplete or duplicate ingredient resolution.");
  }

  return { ingredientIds, newIngredients };
}
