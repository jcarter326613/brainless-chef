import { z } from "zod";

export const userSchema = z
  .object({
    email: z.email(),
    createdAt: z.string().datetime(),
    lastLoginAt: z.string().datetime().nullable(),
    lastLoginLinkSentAt: z.string().datetime().nullable(),
    schemaVersion: z.literal("1.0"),
  })
  .strict();

export type User = z.infer<typeof userSchema>;