import { z } from "zod";

import {
  prepTaskIdSchema,
  toolIdSchema,
} from "./identifiers.js";
import { ingredientInputSchema } from "./ingredient-input.js";
import { allocationQuantitySchema } from "./quantity.js";
import { textSchema } from "./shared.js";

const toolIdListSchema = z.array(toolIdSchema).refine(
  (ids) => new Set(ids).size === ids.length,
  "Tool IDs must be unique.",
);

export const prepTaskInputSchema = z
  .object({
    id: prepTaskIdSchema,
    quantity: allocationQuantitySchema.nullable(),
    type: z.literal("prepTask"),
  })
  .strict();

export const prepInputSchema = z.discriminatedUnion("type", [
  ingredientInputSchema,
  prepTaskInputSchema,
]);

export const prepTaskSchema = z
  .object({
    action: textSchema,
    id: prepTaskIdSchema,
    inputs: z.array(prepInputSchema).min(1),
    instruction: textSchema,
    tools: toolIdListSchema,
  })
  .strict();

export const prepSchema = z
  .object({
    tasks: z.array(prepTaskSchema),
  })
  .strict();

export type PrepInput = z.infer<typeof prepInputSchema>;
export type PrepTask = z.infer<typeof prepTaskSchema>;
