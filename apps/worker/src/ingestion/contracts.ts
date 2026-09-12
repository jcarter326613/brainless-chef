import { ingredientQuantitySchema } from "@brainless-chef/database";
import { z } from "zod";

const keySchema = z.string().trim().min(1).max(80);
const textSchema = z.string().trim().min(1).max(2_000);
const optionalTextSchema = textSchema.nullable();

export const recipeFactsSchema = z
  .object({
    author: optionalTextSchema,
    ingredients: z
      .array(
        z
          .object({
            key: keySchema,
            name: textSchema,
            notes: z.array(textSchema),
            optional: z.boolean(),
            quantity: ingredientQuantitySchema.nullable(),
          })
          .strict(),
      )
      .min(1),
    instructions: z.array(textSchema).min(1),
    title: optionalTextSchema,
    yield: z
      .object({
        quantity: z.number().positive().nullable(),
        unit: z.string().trim().min(1).max(40).nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((facts, context) => {
    const keys = new Set<string>();
    facts.ingredients.forEach((ingredient, index) => {
      if (keys.has(ingredient.key)) {
        context.addIssue({
          code: "custom",
          message: "Ingredient keys must be unique.",
          path: ["ingredients", index, "key"],
        });
      }
      keys.add(ingredient.key);
    });
  });

export const catalogResolutionSchema = z
  .object({
    matches: z.array(
      z
        .object({
          candidateId: z.string().trim().min(1).max(1_500).nullable(),
          ingredientKey: keySchema,
        })
        .strict(),
    ),
  })
  .strict();

const allAllocationSchema = z.object({ kind: z.literal("all") }).strict();
const fractionAllocationSchema = z
  .object({
    denominator: z.number().int().positive(),
    kind: z.literal("fraction"),
    numerator: z.number().int().positive(),
  })
  .strict()
  .superRefine((allocation, context) => {
    if (allocation.numerator > allocation.denominator) {
      context.addIssue({
        code: "custom",
        message: "Allocation fraction cannot exceed the total.",
        path: ["numerator"],
      });
    }
  });

const allocationSchema = z.discriminatedUnion("kind", [allAllocationSchema, fractionAllocationSchema]);

const toolSchema = z
  .object({
    key: keySchema,
    label: optionalTextSchema,
    name: textSchema,
    size: optionalTextSchema,
    type: textSchema,
  })
  .strict();

const prepInputSchema = z.discriminatedUnion("type", [
  z
    .object({
      allocation: allocationSchema,
      ingredientKey: keySchema,
      type: z.literal("ingredient"),
    })
    .strict(),
  z
    .object({
      prepTaskKey: keySchema,
      type: z.literal("prepObject"),
    })
    .strict(),
]);

const cookInputSchema = z.discriminatedUnion("type", [
  z
    .object({
      prepTaskKey: keySchema,
      type: z.literal("prepObject"),
    })
    .strict(),
  z
    .object({
      cookTaskKey: keySchema,
      type: z.literal("cookOutput"),
    })
    .strict(),
]);

const durationSchema = z
  .object({
    attention: z.enum(["active", "occasional", "passive"]),
    maxSeconds: z.number().int().nonnegative().nullable(),
    minSeconds: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const graphPlanSchema = z
  .object({
    cookTasks: z.array(
      z
        .object({
          actionType: textSchema,
          completion: optionalTextSchema,
          duration: durationSchema.nullable(),
          inputs: z.array(cookInputSchema),
          instruction: textSchema,
          key: keySchema,
          output: z
            .object({
              label: textSchema,
              locationToolKey: keySchema.nullable(),
            })
            .strict()
            .nullable(),
          tools: z.array(keySchema),
        })
        .strict(),
    ),
    finalCookTaskKey: keySchema.nullable(),
    prepTasks: z.array(
      z
        .object({
          actionType: textSchema,
          inputs: z.array(prepInputSchema).min(1),
          instruction: textSchema,
          key: keySchema,
          output: z
            .object({
              label: textSchema,
              locationToolKey: keySchema.nullable(),
            })
            .strict(),
          tools: z.array(keySchema),
        })
        .strict(),
    ),
    tools: z.array(toolSchema),
  })
  .strict();

export type CatalogResolution = z.infer<typeof catalogResolutionSchema>;
export type GraphPlan = z.infer<typeof graphPlanSchema>;
export type RecipeFacts = z.infer<typeof recipeFactsSchema>;
