import { z } from "zod";

import { ingredientDocumentIdSchema } from "./identifiers.js";
import { allocationQuantitySchema } from "./quantity.js";

export const ingredientInputSchema = z
  .object({
    id: ingredientDocumentIdSchema,
    quantity: allocationQuantitySchema.nullable(),
    type: z.literal("ingredient"),
  })
  .strict();

export type IngredientInput = z.infer<typeof ingredientInputSchema>;
