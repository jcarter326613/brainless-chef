import path from "node:path";

import cookieParser from "cookie-parser";
import express from "express";

import type { AppConfig } from "./config.js";
import { createAuthRouter } from "./routes/auth.js";
import type { Mailer } from "./services/mail-service.js";
import { createTokenService } from "./services/token-service.js";
import { createUserService, type AuthDatabase } from "./services/user-service.js";

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const SESSION_COOKIE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

export interface AppOptions {
  config: AppConfig;
  database: AuthDatabase;
  mailer: Mailer;
  staticDir?: string;
}

export function createApp(options: AppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());

  const tokenService = createTokenService(options.config.jwtSecret);
  const userService = createUserService(options.database, {
    loginTokenTtlMs: LOGIN_TOKEN_TTL_MS,
    resendCooldownMs: RESEND_COOLDOWN_MS,
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use(
    createAuthRouter({
      mailer: options.mailer,
      secureCookies: options.config.secureCookies,
      sessionCookieMaxAgeMs: SESSION_COOKIE_MAX_AGE_MS,
      siteOrigin: options.config.siteOrigin,
      tokenService,
      userService,
    }),
  );

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  const staticDir = options.staticDir ?? path.resolve(import.meta.dirname, "..", "dist");
  app.use(express.static(staticDir));

  app.get("/*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.sendFile(path.join(staticDir, "index.html"), (error) => {
      if (error) {
        next(error);
      }
    });
  });

  return app;
}