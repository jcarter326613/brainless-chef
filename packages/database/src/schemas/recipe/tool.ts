import { z } from "zod";

import { toolIdSchema } from "./identifiers.js";
import { textSchema } from "./shared.js";

export const toolSchema = z
  .object({
    id: toolIdSchema,
    label: textSchema.nullable(),
    name: textSchema,
    type: textSchema.toLowerCase(),
  })
  .strict();

export type Tool = z.infer<typeof toolSchema>;
