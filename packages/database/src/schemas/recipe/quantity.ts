import { z } from "zod";

import { unitSchema } from "./shared.js";

const positiveNumberSchema = z.number().positive();

export const packageSizeSchema = z
  .object({
    unit: unitSchema,
    value: positiveNumberSchema,
  })
  .strict();

export const exactQuantitySchema = z
  .object({
    kind: z.literal("exact"),
    packageSize: packageSizeSchema.nullable(),
    unit: unitSchema,
    value: positiveNumberSchema,
  })
  .strict();

export const rangeQuantitySchema = z
  .object({
    kind: z.literal("range"),
    max: positiveNumberSchema,
    min: positiveNumberSchema,
    unit: unitSchema,
  })
  .strict()
  .superRefine((quantity, context) => {
    if (quantity.max < quantity.min) {
      context.addIssue({
        code: "custom",
        message: "Range maximum cannot be less than its minimum.",
        path: ["max"],
      });
    }
  });

export const approximateQuantitySchema = z
  .object({
    kind: z.literal("approximate"),
    unit: unitSchema,
    value: positiveNumberSchema,
  })
  .strict();

export const toTasteQuantitySchema = z
  .object({
    kind: z.literal("to-taste"),
    unit: unitSchema.nullable(),
  })
  .strict();

export const asNeededQuantitySchema = z
  .object({
    kind: z.literal("as-needed"),
    unit: unitSchema.nullable(),
  })
  .strict();

export const ingredientQuantitySchema = z.discriminatedUnion("kind", [
  exactQuantitySchema,
  rangeQuantitySchema,
  approximateQuantitySchema,
  toTasteQuantitySchema,
  asNeededQuantitySchema,
]);

export const allocationQuantitySchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("exact"),
      unit: unitSchema,
      value: positiveNumberSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("range"),
      max: positiveNumberSchema,
      min: positiveNumberSchema,
      unit: unitSchema,
    })
    .strict()
    .superRefine((quantity, context) => {
      if (quantity.max < quantity.min) {
        context.addIssue({
          code: "custom",
          message: "Range maximum cannot be less than its minimum.",
          path: ["max"],
        });
      }
    }),
  approximateQuantitySchema,
  toTasteQuantitySchema,
  asNeededQuantitySchema,
]);

export type AllocationQuantity = z.infer<typeof allocationQuantitySchema>;
export type IngredientQuantity = z.infer<typeof ingredientQuantitySchema>;
export type PackageSize = z.infer<typeof packageSizeSchema>;
