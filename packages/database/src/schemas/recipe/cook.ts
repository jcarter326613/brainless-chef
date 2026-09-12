import { z } from "zod";

import {
  cookOutputIdSchema,
  cookTaskIdSchema,
  prepObjectIdSchema,
  toolIdSchema,
} from "./identifiers.js";
import { textSchema } from "./shared.js";

export const cookActionTypeSchema = z.enum([
  "preheat",
  "heat",
  "add",
  "combine",
  "stir",
  "whisk",
  "fold",
  "saute",
  "sear",
  "fry",
  "boil",
  "simmer",
  "bake",
  "roast",
  "broil",
  "steam",
  "cover",
  "uncover",
  "reduce-heat",
  "increase-heat",
  "remove-from-heat",
  "drain",
  "transfer",
  "rest",
  "serve",
  "custom",
]);

const toolIdListSchema = z.array(toolIdSchema).refine(
  (ids) => new Set(ids).size === ids.length,
  "Tool IDs must be unique.",
);

export const cookPrepObjectInputSchema = z
  .object({
    id: prepObjectIdSchema,
    type: z.literal("prepObject"),
  })
  .strict();

export const cookOutputInputSchema = z
  .object({
    id: cookOutputIdSchema,
    type: z.literal("cookOutput"),
  })
  .strict();

export const cookInputSchema = z.discriminatedUnion("type", [
  cookPrepObjectInputSchema,
  cookOutputInputSchema,
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

export const cookOutputSchema = z
  .object({
    id: cookOutputIdSchema,
    label: textSchema,
    locationToolId: toolIdSchema.nullable(),
  })
  .strict();

export const cookTaskSchema = z
  .object({
    action: z
      .object({
        type: cookActionTypeSchema,
      })
      .strict(),
    completion: textSchema.nullable(),
    duration: durationSchema.nullable(),
    id: cookTaskIdSchema,
    inputs: z.array(cookInputSchema),
    instruction: textSchema,
    output: cookOutputSchema.nullable(),
    tools: toolIdListSchema,
  })
  .strict();

export const cookSchema = z
  .object({
    finalOutputId: cookOutputIdSchema.nullable(),
    tasks: z.array(cookTaskSchema),
  })
  .strict();

export type CookInput = z.infer<typeof cookInputSchema>;
export type CookOutput = z.infer<typeof cookOutputSchema>;
export type CookTask = z.infer<typeof cookTaskSchema>;
