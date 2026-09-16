import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().int().positive().default(8080),
  firestoreDatabaseId: z.string().trim().min(1),
  jwtSecret: z.string().trim().min(32),
  mailFrom: z.string().trim().min(1),
  mailtrapApiToken: z.string().trim().min(1),
  mailtrapMode: z.union([z.literal("sending"), z.literal("sandbox")]),
  secureCookies: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((value) => value === "true"),
  siteOrigin: z.string().trim().url(),
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
    secureCookies: env.COOKIE_SECURE,
    siteOrigin: env.SITE_ORIGIN,
  });
}