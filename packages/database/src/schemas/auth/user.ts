import { z } from "zod";

export const userSchema = z
  .object({
    email: z.email(),
    createdAtEpoch: z.number(),
    lastLoginAtEpoch: z.number().nullable(),
    lastLoginLinkSentAtEpoch: z.number().nullable(),
    schemaVersion: z.literal("2.0"),
  })
  .strict();

export type User = z.infer<typeof userSchema>;