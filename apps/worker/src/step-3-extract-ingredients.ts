import { ingredientQuantitySchema, ingredientSchema, type IngredientQuantity } from "@brainless-chef/database/schemas";
import { LlamaChatSession, type LlamaGrammar } from "node-llama-cpp";

import type { Component, InferenceDependencies, RecipeGroup, StructuredIngredient } from "./types.js";

const instructions = `
Convert the supplied ingredient into a structured ingredient record.

- Use only the supplied ingredient text and component context. Do not infer an ingredient, quantity, or conversion that is not present.
- Use component context only to determine optionality. Never use it to derive the ingredient name, quantity, or notes.
- The ingredient name must be grounded in the ingredient text. Never use a component-only word in the ingredient name.
- Do not add component labels or component optionality to notes.
- Normalize the ingredient name and quantity unit to lowercase words. Put preparation, alternate names, source-specific details, and parenthetical information in notes.
- Mark optional true only when the ingredient or its component context explicitly indicates optionality. A component name containing "optional" explicitly indicates optionality.
- Parse exact, range, approximate, to-taste, and as-needed quantities. Use null only when no quantity is stated.
- A stated numeric value, fraction, or mixed number is exact unless the source explicitly qualifies it as approximate or a range.
- Exact quantities require packageSize. Use null when no package size is stated.
- When equivalent metric and English/US customary quantities are both explicitly stated, the English/US customary quantity is required output. Never output the metric quantity, retain it in notes, or calculate a new conversion.
- Quantity values belong only in value, min, or max. The unit field contains only the unit name or abbreviation, never a number, fraction, slash, or other quantity text.
- When selecting English/US customary quantity from a metric pair, use that quantity's numeric value with its unit. Never pair a metric numeric value with an English/US customary unit.
- When only a metric quantity is stated, preserve that metric quantity.
`;

const quantitySchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        kind: { enum: ["exact"] },
        packageSize: {
          oneOf: [
            {
              type: "object",
              properties: {
                unit: { type: "string" },
                value: { type: "number" },
              },
              required: ["unit", "value"],
              additionalProperties: false,
            },
            { type: "null" },
          ],
        },
        unit: { type: "string" },
        value: { type: "number" },
      },
      required: ["kind", "packageSize", "unit", "value"],
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
          oneOf: [
            { type: "string" },
            { type: "null" },
          ],
        },
      },
      required: ["kind", "unit"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
};

const responseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    notes: {
      type: "array",
      items: { type: "string" },
    },
    optional: { type: "boolean" },
    quantity: quantitySchema,
  },
  required: ["name", "notes", "optional", "quantity"],
  additionalProperties: false,
};

interface IngredientResponse {
  name: string;
  notes: string[];
  optional: boolean;
  quantity: IngredientQuantity | null;
}

interface IngredientExtractionOutput {
  component: Component | null;
  source: string;
  ingredient: StructuredIngredient;
  output: string;
  requestTokens: number;
  durationMs: number;
}

export interface IngredientExtractionResult {
  ingredientGroups: Array<{ component: Component | null; ingredients: StructuredIngredient[] }>;
  outputs: IngredientExtractionOutput[];
  requestTokens: number;
  durationMs: number;
}

function parseIngredient(response: IngredientResponse): StructuredIngredient {
  const ingredient = ingredientSchema.parse({ name: response.name });

  return {
    name: ingredient.name,
    notes: response.notes.map((note) => note.trim()).filter(Boolean),
    optional: response.optional,
    quantity: response.quantity === null ? null : ingredientQuantitySchema.parse(response.quantity),
  };
}

async function extractIngredient({
  grammar,
  ingredient,
  llama,
  model,
  component,
}: InferenceDependencies & { grammar: LlamaGrammar; ingredient: string; component: Component | null }): Promise<Omit<IngredientExtractionOutput, "component" | "source">> {
  const context = await model.createContext({ contextSize: 16_384 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence() as never, systemPrompt: instructions });
  const input = JSON.stringify({ component, ingredient });
  const requestTokens = model.tokenize(`${instructions}\n${input}`).length;
  const startedAt = performance.now();

  try {
    const output = await session.prompt(input, { grammar, maxTokens: 1_024, temperature: 0 });

    return {
      ingredient: parseIngredient(JSON.parse(output) as IngredientResponse),
      output,
      requestTokens,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await context.dispose();
  }
}

export async function extractIngredients({
  llama,
  model,
  groups,
}: InferenceDependencies & { groups: RecipeGroup[] }): Promise<IngredientExtractionResult> {
  const grammar = await llama.createGrammarForJsonSchema(responseSchema as never);
  const startedAt = performance.now();
  const outputs: IngredientExtractionOutput[] = [];
  const ingredientGroups: IngredientExtractionResult["ingredientGroups"] = [];

  for (const group of groups) {
    if (group.ingredients === null) continue;

    const ingredients: StructuredIngredient[] = [];

    for (const source of group.ingredients) {
      const result = await extractIngredient({
        grammar,
        ingredient: source,
        llama,
        model,
        component: group.component,
      });

      ingredients.push(result.ingredient);
      outputs.push({ component: group.component, source, ...result });
    }

    ingredientGroups.push({ component: group.component, ingredients });
  }

  return {
    ingredientGroups,
    outputs,
    requestTokens: outputs.reduce((total, output) => total + output.requestTokens, 0),
    durationMs: Math.round(performance.now() - startedAt),
  };
}
