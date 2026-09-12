import { expect, it, vi } from "vitest";

import { recipeFactsSchema } from "../../src/ingestion/contracts.js";
import { deriveGrammarSchema } from "../../src/ingestion/grammar-schema.js";

vi.hoisted(() => {
  process.env.FIRESTORE_DATABASE_ID = "worker-test";
});

const collectKeys = (value: unknown, keys: string[] = []): string[] => {
  if (Array.isArray(value)) return value.flatMap((entry) => collectKeys(entry, keys));
  if (typeof value !== "object" || value === null) return keys;

  Object.entries(value).forEach(([key, entry]) => {
    keys.push(key);
    collectKeys(entry, keys);
  });
  return keys;
};

it("derives grammar structure from Zod without bounded repetition constraints", () => {
  const grammar = deriveGrammarSchema(recipeFactsSchema) as {
    additionalProperties?: boolean;
    properties?: Record<string, unknown>;
    required?: string[];
  };

  expect(grammar.additionalProperties).toBe(false);
  expect(grammar.required).toEqual(["author", "ingredients", "instructions", "title", "yield"]);
  expect(grammar.properties).toHaveProperty("ingredients");
  expect(collectKeys(grammar)).not.toEqual(
    expect.arrayContaining(["maxItems", "maxLength", "minItems", "minLength"]),
  );
});
