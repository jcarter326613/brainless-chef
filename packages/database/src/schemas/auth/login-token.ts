import { z } from "zod";

export const loginTokenSchema = z
  .object({
    email: z.email(),
    createdAtEpoch: z.number(),
    expiresAtEpoch: z.number(),
    schemaVersion: z.literal("2.0"),
  })
  .strict();

export type LoginToken = z.infer<typeof loginTokenSchema>;