import { z } from "zod";

export const loginTokenSchema = z
  .object({
    email: z.email(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    schemaVersion: z.literal("1.0"),
  })
  .strict();

export type LoginToken = z.infer<typeof loginTokenSchema>;