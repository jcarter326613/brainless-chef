import { z } from "zod";

import {
  cookTaskIdSchema,
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

export const cookPrepTaskInputSchema = z
  .object({
    id: prepTaskIdSchema,
    quantity: allocationQuantitySchema.nullable(),
    type: z.literal("prepTask"),
  })
  .strict();

export const cookTaskInputSchema = z
  .object({
    id: cookTaskIdSchema,
    quantity: allocationQuantitySchema.nullable(),
    type: z.literal("cookTask"),
  })
  .strict();

export const cookInputSchema = z.discriminatedUnion("type", [
  ingredientInputSchema,
  cookPrepTaskInputSchema,
  cookTaskInputSchema,
]);

export const durationSchema = z
  .object({
    attention: z.enum(["active", "occasional", "passive"]),
    maxSeconds: z.number().int().nonnegative().nullable(),
    minSeconds: z.number().int().nonnegative().nullable(),
    timerRecommended: z.boolean(),
  })
  .strict()
  .superRefine((duration, context) => {
    if (
      duration.minSeconds !== null &&
      duration.maxSeconds !== null &&
      duration.maxSeconds < duration.minSeconds
    ) {
      context.addIssue({
        code: "custom",
        message: "Duration maximum cannot precede its minimum.",
        path: ["maxSeconds"],
      });
    }
  });

export const cookTaskSchema = z
  .object({
    action: textSchema,
    completion: textSchema.nullable(),
    duration: durationSchema.nullable(),
    id: cookTaskIdSchema,
    inputs: z.array(cookInputSchema),
    instruction: textSchema,
    tools: toolIdListSchema,
  })
  .strict();

export const cookSchema = z
  .object({
    tasks: z.array(cookTaskSchema),
  })
  .strict();

export type CookInput = z.infer<typeof cookInputSchema>;
export type CookTask = z.infer<typeof cookTaskSchema>;
