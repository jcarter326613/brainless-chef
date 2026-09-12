import { z } from "zod";

import {
  ingredientDocumentIdSchema,
  prepObjectIdSchema,
  prepTaskIdSchema,
  toolIdSchema,
} from "./identifiers.js";
import { allocationQuantitySchema } from "./quantity.js";
import { textSchema } from "./shared.js";

export const prepActionTypeSchema = z.enum([
  "measure",
  "portion",
  "divide",
  "peel",
  "trim",
  "chop",
  "dice",
  "mince",
  "slice",
  "grate",
  "zest",
  "juice",
  "rinse",
  "drain",
  "crack",
  "beat",
  "whisk",
  "mix",
  "combine",
  "coat",
  "marinate",
  "transfer",
  "custom",
]);

const toolIdListSchema = z.array(toolIdSchema).refine(
  (ids) => new Set(ids).size === ids.length,
  "Tool IDs must be unique.",
);

export const prepIngredientInputSchema = z
  .object({
    id: ingredientDocumentIdSchema,
    quantity: allocationQuantitySchema.nullable(),
    type: z.literal("ingredient"),
  })
  .strict();

export const prepObjectInputSchema = z
  .object({
    id: prepObjectIdSchema,
    type: z.literal("prepObject"),
  })
  .strict();

export const prepInputSchema = z.discriminatedUnion("type", [
  prepIngredientInputSchema,
  prepObjectInputSchema,
]);

export const prepObjectSchema = z
  .object({
    id: prepObjectIdSchema,
    label: textSchema,
    locationToolId: toolIdSchema.nullable(),
  })
  .strict();

export const prepTaskSchema = z
  .object({
    action: z
      .object({
        type: prepActionTypeSchema,
      })
      .strict(),
    id: prepTaskIdSchema,
    inputs: z.array(prepInputSchema).min(1),
    instruction: textSchema,
    output: prepObjectSchema,
    tools: toolIdListSchema,
  })
  .strict();

export const prepSchema = z
  .object({
    tasks: z.array(prepTaskSchema),
  })
  .strict();

export type PrepInput = z.infer<typeof prepInputSchema>;
export type PrepObject = z.infer<typeof prepObjectSchema>;
export type PrepTask = z.infer<typeof prepTaskSchema>;
