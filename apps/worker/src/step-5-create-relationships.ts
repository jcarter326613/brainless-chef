import {
  allocationQuantitySchema,
  type AllocationQuantity,
  type IngredientQuantity,
} from "@brainless-chef/database/schemas";
import { LlamaChatSession, type LlamaGrammar } from "node-llama-cpp";

import type { IngredientExtractionResult } from "./step-3-extract-ingredients.js";
import type { AtomicDirection, Component, InferenceDependencies, StructuredIngredient } from "./types.js";

const instructions = `
Resolve the inputs for one atomic recipe direction using only the supplied available candidates.

- Select every candidate that the direction uses as an input. Do not select candidates that are merely mentioned or used only as equipment or location.
- Use only supplied candidate IDs. Do not infer an ingredient, direction, or candidate ID that is absent.
- Set quantity to null when the direction gives no amount. For a fractional amount, express the fraction as an exact quantity with unit "whole"; for example, one third is 0.33 whole.
- Set fullyConsumed true only when the direction uses all of the candidate currently available. If the direction uses an unstated amount, it uses all available candidate material.
- Set available when the direction combines, transforms, or moves material that can be used by a later direction. Give it a concise grounded label and the named container when present. Set it null for actions that do not make material available, such as preheating or lining a pan.
- The available label must describe only material produced from the selected inputs and the current direction. Do not invent ingredients, quantities, containers, or actions.
- Ignore candidates used only as a release or coating on a pan, sheet, tray, or work surface. Greasing, oiling, buttering, flouring, dusting, coating, or spraying a pan or surface does not consume the candidate as food.
- For directions that only treat a pan or work surface, select no inputs and set available to null.
`;

const allocationQuantityResponseSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        kind: { enum: ["exact"] },
        unit: { type: "string" },
        value: { type: "number" },
      },
      required: ["kind", "unit", "value"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { enum: ["range"] },
        max: { type: "number" },
        min: { type: "number" },
        unit: { type: "string" },
      },
      required: ["kind", "max", "min", "unit"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { enum: ["approximate"] },
        unit: { type: "string" },
        value: { type: "number" },
      },
      required: ["kind", "unit", "value"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        kind: { enum: ["to-taste", "as-needed"] },
        unit: {
          oneOf: [{ type: "string" }, { type: "null" }],
        },
      },
      required: ["kind", "unit"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
};

export interface IndexedIngredient {
  component: Component | null;
  index: number;
  ingredient: StructuredIngredient;
}

export interface IngredientRelationshipInput {
  ingredientIndex: number;
  quantity: AllocationQuantity | null;
  type: "ingredient";
}

export interface DirectionRelationshipInput {
  directionOrder: number;
  quantity: AllocationQuantity | null;
  type: "direction";
}

export type RelationshipInput = IngredientRelationshipInput | DirectionRelationshipInput;

export interface AvailableMaterial {
  container: string | null;
  label: string;
}

export interface DirectionRelationship {
  available: AvailableMaterial | null;
  direction: AtomicDirection;
  inputs: RelationshipInput[];
}

interface CandidateView {
  component: string | null;
  container: string | null;
  id: string;
  label: string;
  quantity: AllocationQuantity | null;
  remainingWhole: number;
  type: "direction" | "ingredient";
}

interface IngredientCandidate {
  entry: IndexedIngredient;
  remainingWhole: number;
  type: "ingredient";
}

interface DirectionCandidate {
  available: AvailableMaterial;
  direction: AtomicDirection;
  remainingWhole: number;
  type: "direction";
}

type Candidate = IngredientCandidate | DirectionCandidate;

interface RelationshipResponse {
  available: AvailableMaterial | null;
  inputs: Array<{
    candidateId: string;
    fullyConsumed: boolean;
    quantity: AllocationQuantity | null;
  }>;
}

export interface RelationshipCreationOutput {
  candidates: CandidateView[];
  durationMs: number;
  output: string;
  relationship: DirectionRelationship;
  requestTokens: number;
}

export interface RelationshipCreationResult {
  directions: AtomicDirection[];
  durationMs: number;
  ingredients: IndexedIngredient[];
  outputs: RelationshipCreationOutput[];
  relationships: DirectionRelationship[];
  requestTokens: number;
}

const normalizeCategory = (component: Component | null) => {
  if (component === null) return null;

  return component.name.trim().toLowerCase().replace(/^optional\s+/, "");
};

const singularToken = (token: string) => {
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
};

const categoryTokens = (component: Component | null) => {
  const category = normalizeCategory(component);
  return category === null ? [] : category.split(/[^a-z0-9]+/).filter(Boolean).map(singularToken);
};

const categoriesMatch = (left: Component | null, right: Component | null) => {
  const leftTokens = categoryTokens(left);
  const rightTokens = categoryTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;

  return leftTokens.every((token) => rightTokens.includes(token)) || rightTokens.every((token) => leftTokens.includes(token));
};

const toAllocationQuantity = (quantity: IngredientQuantity | null): AllocationQuantity | null => {
  if (quantity === null) return null;
  if (quantity.kind !== "exact") return quantity;

  return { kind: "exact", unit: quantity.unit, value: quantity.value };
};

const wholeQuantity = (value: number): AllocationQuantity => ({ kind: "exact", unit: "whole", value });

const candidateId = (candidate: Candidate) =>
  candidate.type === "ingredient"
    ? `ingredient:${candidate.entry.index}`
    : `direction:${candidate.direction.order}`;

const candidateView = (candidate: Candidate): CandidateView => {
  if (candidate.type === "ingredient") {
    return {
      component: normalizeCategory(candidate.entry.component),
      container: null,
      id: candidateId(candidate),
      label: candidate.entry.ingredient.name,
      quantity: toAllocationQuantity(candidate.entry.ingredient.quantity),
      remainingWhole: candidate.remainingWhole,
      type: "ingredient",
    };
  }

  return {
    component: normalizeCategory(candidate.direction.component),
    container: candidate.available.container,
    id: candidateId(candidate),
    label: candidate.available.label,
    quantity: wholeQuantity(candidate.remainingWhole),
    remainingWhole: candidate.remainingWhole,
    type: "direction",
  };
};

const createResponseSchema = (candidates: CandidateView[]) => {
  const input = candidates.length === 0
    ? { type: "array", maxItems: 0 }
    : {
      type: "array",
      items: {
        type: "object",
        properties: {
          candidateId: { enum: candidates.map((candidate) => candidate.id) },
          fullyConsumed: { type: "boolean" },
          quantity: allocationQuantityResponseSchema,
        },
        required: ["candidateId", "fullyConsumed", "quantity"],
        additionalProperties: false,
      },
    };

  return {
    type: "object",
    properties: {
      available: {
        oneOf: [
          {
            type: "object",
            properties: {
              container: { oneOf: [{ type: "string" }, { type: "null" }] },
              label: { type: "string" },
            },
            required: ["container", "label"],
            additionalProperties: false,
          },
          { type: "null" },
        ],
      },
      inputs: input,
    },
    required: ["available", "inputs"],
    additionalProperties: false,
  };
};

const updateRemainingWhole = (candidate: Candidate, quantity: AllocationQuantity | null, fullyConsumed: boolean) => {
  if (fullyConsumed || quantity?.kind !== "exact" || quantity.unit !== "whole") return fullyConsumed;
  if (quantity.value >= candidate.remainingWhole) return true;

  candidate.remainingWhole = Math.max(0, Number((candidate.remainingWhole - quantity.value).toFixed(12)));
  return candidate.remainingWhole === 0;
};

async function resolveDirection({
  candidates,
  direction,
  llama,
  model,
}: InferenceDependencies & { candidates: CandidateView[]; direction: AtomicDirection }): Promise<Omit<RelationshipCreationOutput, "candidates" | "relationship"> & { response: RelationshipResponse }> {
  const context = await model.createContext({ contextSize: 16_384 });
  const grammar = await llama.createGrammarForJsonSchema(createResponseSchema(candidates) as never);
  const session = new LlamaChatSession({ contextSequence: context.getSequence() as never, systemPrompt: instructions });
  const input = JSON.stringify({ candidates, component: direction.component, direction: direction.direction });
  const requestTokens = model.tokenize(`${instructions}\n${input}`).length;
  const startedAt = performance.now();

  try {
    const output = await session.prompt(input, { grammar, maxTokens: 1_024, temperature: 0 });

    return {
      durationMs: Math.round(performance.now() - startedAt),
      output,
      requestTokens,
      response: JSON.parse(output) as RelationshipResponse,
    };
  } finally {
    await context.dispose();
  }
}

export async function createRelationships({
  directions,
  ingredientGroups,
  llama,
  model,
}: InferenceDependencies & {
  directions: AtomicDirection[];
  ingredientGroups: IngredientExtractionResult["ingredientGroups"];
}): Promise<RelationshipCreationResult> {
  const ingredients: IndexedIngredient[] = [];
  for (const { component, ingredients: groupIngredients } of ingredientGroups) {
    for (const ingredient of groupIngredients) {
      ingredients.push({ component, index: ingredients.length, ingredient });
    }
  }

  const activeIngredients = new Map(ingredients.map((entry) => [entry.index, { entry, remainingWhole: 1, type: "ingredient" as const }]));
  const activeDirections = new Map<number, DirectionCandidate>();
  const outputs: RelationshipCreationOutput[] = [];
  const relationships: DirectionRelationship[] = [];
  const startedAt = performance.now();

  for (const direction of directions) {
    const hasMatchingCategory = ingredients.some((ingredient) => categoriesMatch(direction.component, ingredient.component));
    const candidates: Candidate[] = [
      ...[...activeIngredients.values()].filter(
        (candidate) => !hasMatchingCategory || categoriesMatch(direction.component, candidate.entry.component),
      ),
      ...activeDirections.values(),
    ];
    const candidateViews = candidates.map(candidateView);
    const result = await resolveDirection({ candidates: candidateViews, direction, llama, model });
    const { response, ...output } = result;
    const candidatesById = new Map(candidates.map((candidate) => [candidateId(candidate), candidate]));
    const selectedCandidateIds = new Set<string>();
    const inputs: RelationshipInput[] = [];

    for (const input of response.inputs) {
      if (selectedCandidateIds.has(input.candidateId)) {
        throw new Error(`Direction ${direction.order} selects candidate ${input.candidateId} more than once.`);
      }
      selectedCandidateIds.add(input.candidateId);

      const candidate = candidatesById.get(input.candidateId);
      if (!candidate) throw new Error(`Direction ${direction.order} references unavailable candidate ${input.candidateId}.`);

      const inferredQuantity = input.quantity === null ? null : allocationQuantitySchema.parse(input.quantity);
      const quantity = inferredQuantity ?? (
        candidate.type === "ingredient"
          ? toAllocationQuantity(candidate.entry.ingredient.quantity)
          : wholeQuantity(candidate.remainingWhole)
      );
      const fullyConsumed = updateRemainingWhole(candidate, inferredQuantity, input.fullyConsumed || inferredQuantity === null);

      if (candidate.type === "ingredient") {
        inputs.push({ ingredientIndex: candidate.entry.index, quantity, type: "ingredient" });
        if (fullyConsumed) activeIngredients.delete(candidate.entry.index);
      } else {
        inputs.push({ directionOrder: candidate.direction.order, quantity, type: "direction" });
        if (fullyConsumed) activeDirections.delete(candidate.direction.order);
      }
    }

    const relationship: DirectionRelationship = {
      available: response.available,
      direction,
      inputs,
    };
    if (relationship.available !== null) {
      activeDirections.set(direction.order, {
        available: relationship.available,
        direction,
        remainingWhole: 1,
        type: "direction",
      });
    }

    relationships.push(relationship);
    outputs.push({ candidates: candidateViews, relationship, ...output });
  }

  return {
    directions,
    durationMs: Math.round(performance.now() - startedAt),
    ingredients,
    outputs,
    relationships,
    requestTokens: outputs.reduce((total, output) => total + output.requestTokens, 0),
  };
}
