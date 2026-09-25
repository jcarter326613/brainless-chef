import { z } from "zod";

const configSchema = z
  .object({
    port: z.coerce.number().int().positive().default(8080),
    firestoreDatabaseId: z.string().trim().min(1),
    jwtSecret: z.string().trim().min(32),
    mailFrom: z.string().trim().min(1),
    mailtrapApiToken: z.string().trim().min(1),
    mailtrapMode: z.union([z.literal("sending"), z.literal("sandbox")]),
    mailtrapTestInboxId: z.coerce.number().int().positive().optional(),
    publicApiUrl: z.string().trim().url(),
    secureCookies: z
      .union([z.literal("true"), z.literal("false")])
      .default("true")
      .transform((value) => value === "true"),
  })
  .refine((config) => config.mailtrapMode !== "sandbox" || config.mailtrapTestInboxId != null, {
    message: "MAILTRAP_TEST_INBOX_ID is required when MAILTRAP_MODE is sandbox",
    path: ["mailtrapTestInboxId"],
  });

export type AppConfig = z.output<typeof configSchema>;
export type RawConfig = z.input<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse({
    port: env.PORT,
    firestoreDatabaseId: env.FIRESTORE_DATABASE_ID,
    jwtSecret: env.JWT_SECRET,
    mailFrom: env.MAIL_FROM,
    mailtrapApiToken: env.MAILTRAP_API_TOKEN,
    mailtrapMode: env.MAILTRAP_MODE,
    mailtrapTestInboxId: env.MAILTRAP_TEST_INBOX_ID,
    publicApiUrl: env.PUBLIC_API_URL,
    secureCookies: env.COOKIE_SECURE,
  });
}
