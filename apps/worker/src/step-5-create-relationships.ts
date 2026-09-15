import type { IngredientExtractionResult } from "./step-3-extract-ingredients.js";
import type { AtomicDirection, Component, StructuredIngredient } from "./types.js";

export interface IndexedIngredient {
  component: Component | null;
  index: number;
  ingredient: StructuredIngredient;
}

export interface DirectionRelationship {
  direction: AtomicDirection;
  inputs: [];
}

export interface RelationshipCreationResult {
  directions: AtomicDirection[];
  ingredients: IndexedIngredient[];
  relationships: DirectionRelationship[];
}

export function createRelationships({
  directions,
  ingredientGroups,
}: {
  directions: AtomicDirection[];
  ingredientGroups: IngredientExtractionResult["ingredientGroups"];
}): RelationshipCreationResult {
  const ingredients: IndexedIngredient[] = [];

  for (const { component, ingredients: groupIngredients } of ingredientGroups) {
    for (const ingredient of groupIngredients) {
      ingredients.push({ component, index: ingredients.length, ingredient });
    }
  }

  return {
    directions,
    ingredients,
    relationships: directions.map((direction): DirectionRelationship => ({ direction, inputs: [] })),
  };
}
