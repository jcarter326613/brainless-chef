import { getLlama, LlamaChatSession } from "node-llama-cpp";

const MAX_INPUT_TOKENS = 6_500;

export interface RecipeDraft {
  title: string;
  ingredients: Array<{
    name: string;
    quantity: number | null;
    unit: string | null;
  }>;
  instructions: string[];
}

export const recipeDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 200 },
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          quantity: {
            oneOf: [{ type: "number" }, { type: "null" }],
          },
          unit: {
            oneOf: [
              { type: "string", minLength: 1, maxLength: 40 },
              { type: "null" },
            ],
          },
        },
        required: ["name", "quantity", "unit"],
      },
    },
    instructions: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1, maxLength: 1_000 },
    },
  },
  required: ["title", "ingredients", "instructions"],
} as const;

const recipeExtractionPrompt = `Extract a recipe from pasted text. Return only one JSON object with title, ingredients, and instructions.

Rules:
- Use only facts present in the pasted text. Never invent ingredient amounts, units, times, temperatures, or titles.
- quantity is a JSON number only, never text. Convert common fractions: 1/2 becomes 0.5 and 1 1/2 becomes 1.5.
- unit is a lowercase measurement name only, never part of quantity. Use null for both quantity and unit when an ingredient has no stated amount.
- Use the recipe heading as title. When there is no heading, use "Untitled recipe".
- Each instruction is plain imperative text with no labels or prefixes such as "description:" or "step 1:".

Example source:
Quick flatbread
Ingredients: 1 cup flour, 1/2 cup water, 1 teaspoon salt.
Instructions: Mix the flour, water, and salt. Cook in a dry pan for 2 minutes per side.

Example output:
{"title":"Quick flatbread","ingredients":[{"name":"flour","quantity":1,"unit":"cup"},{"name":"water","quantity":0.5,"unit":"cup"},{"name":"salt","quantity":1,"unit":"teaspoon"}],"instructions":["Mix the flour, water, and salt.","Cook in a dry pan for 2 minutes per side."]}

Example source:
Ingredients: water as needed. Instructions: Add water slowly.

Example output:
{"title":"Untitled recipe","ingredients":[{"name":"water","quantity":null,"unit":null}],"instructions":["Add water slowly."]}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const readNonEmptyString = (value: unknown, field: string, maximumLength: number) => {
  if (typeof value !== "string") throw new Error(`${field} must be a string.`);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw new Error(`${field} must be a non-empty string no longer than ${maximumLength} characters.`);
  }
  return normalized;
};

export function parseRecipeDraft(output: string): RecipeDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("The model returned invalid JSON.");
  }

  if (!isRecord(parsed) || !hasOnlyKeys(parsed, ["title", "ingredients", "instructions"])) {
    throw new Error("The model returned an invalid recipe object.");
  }

  if (!Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
    throw new Error("The model returned no ingredients.");
  }
  if (!Array.isArray(parsed.instructions) || parsed.instructions.length === 0) {
    throw new Error("The model returned no instructions.");
  }

  const ingredients = parsed.ingredients.map((ingredient, index) => {
    if (!isRecord(ingredient) || !hasOnlyKeys(ingredient, ["name", "quantity", "unit"])) {
      throw new Error(`Ingredient ${index + 1} is invalid.`);
    }

    const name = readNonEmptyString(ingredient.name, `Ingredient ${index + 1} name`, 200);
    const quantity = ingredient.quantity;
    if (quantity !== null && (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0)) {
      throw new Error(`Ingredient ${index + 1} quantity must be a positive number or null.`);
    }

    const unit = ingredient.unit;
    if (unit !== null && typeof unit !== "string") {
      throw new Error(`Ingredient ${index + 1} unit must be a string or null.`);
    }
    if (quantity === null && unit !== null) {
      throw new Error(`Ingredient ${index + 1} cannot have a unit without a quantity.`);
    }

    const normalizedUnit =
      unit === null ? null : readNonEmptyString(unit, `Ingredient ${index + 1} unit`, 40).toLowerCase();
    if (normalizedUnit !== null && !/^[a-z]+(?: [a-z]+)*$/.test(normalizedUnit)) {
      throw new Error(`Ingredient ${index + 1} unit must contain only lowercase measurement words.`);
    }

    return { name, quantity, unit: normalizedUnit };
  });

  const instructions = parsed.instructions.map((instruction, index) => {
    const text = readNonEmptyString(instruction, `Instruction ${index + 1}`, 1_000);
    if (/^(description|instruction|step)\s*:/i.test(text)) {
      throw new Error(`Instruction ${index + 1} must not contain a metadata prefix.`);
    }
    return text;
  });

  return {
    title: readNonEmptyString(parsed.title, "Title", 200),
    ingredients,
    instructions,
  };
}

export async function inferRecipe(input: string, modelPath: string): Promise<string> {
  const llama = await getLlama({ build: "never", gpu: false, skipDownload: true });
  const model = await llama.loadModel({ modelPath });
  const inputTokens = model.tokenize(input);
  if (inputTokens.length > MAX_INPUT_TOKENS) {
    throw new Error("Recipe input exceeds the model token budget.");
  }

  const context = await model.createContext({ contextSize: 10_240 });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: recipeExtractionPrompt,
  });
  const grammar = await llama.createGrammarForJsonSchema(recipeDraftJsonSchema);
  const output = await session.prompt(input, { grammar, maxTokens: 1_024, temperature: 0 });

  grammar.parse(output);
  return JSON.stringify(parseRecipeDraft(output));
}
