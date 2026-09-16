import { z } from "zod";

import { nameSchema } from "./shared.js";

export const ingredientSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export type Ingredient = z.infer<typeof ingredientSchema>;
