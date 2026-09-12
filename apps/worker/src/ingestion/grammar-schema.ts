import { z } from "zod";

const repetitionConstraints = new Set(["maxItems", "maxLength", "minItems", "minLength"]);

function withoutRepetitionConstraints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRepetitionConstraints);
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !repetitionConstraints.has(key))
      .map(([key, entry]) => [key, withoutRepetitionConstraints(entry)]),
  );
}

export function deriveGrammarSchema(schema: z.ZodType) {
  return withoutRepetitionConstraints(z.toJSONSchema(schema));
}
