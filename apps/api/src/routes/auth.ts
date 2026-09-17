import { Router } from "express";
import { z } from "zod";

import type { Mailer } from "../services/mail-service.js";
import type { TokenService } from "../services/token-service.js";
import type { UserService } from "../services/user-service.js";

const emailSchema = z.object({ email: z.email() });

export function createAuthRouter(options: {
  mailer: Mailer;
  secureCookies: boolean;
  sessionCookieMaxAgeMs: number;
  siteOrigin: string;
  tokenService: TokenService;
  userService: UserService;
}): Router {
  const router = Router();

  router.post("/api/auth/start-login", async (req, res) => {
    const parsed = emailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const prepared = await options.userService.prepareLoginLink(email);

    if (prepared.result === "throttled") {
      res.set("Retry-After", String(Math.ceil(prepared.retryAfterMs / 1000)));
      res.status(429).json({
        error: "login_link_throttled",
        retryAfterMs: prepared.retryAfterMs,
      });
      return;
    }

    const token = options.tokenService.signLoginToken({
      email,
      jti: prepared.jti,
      sub: prepared.user.id,
    });
    const loginUrl = `${options.siteOrigin}/api/auth/verify-login?token=${encodeURIComponent(token)}`;

    try {
      await options.mailer.sendLoginLink({ to: email, loginUrl });
    } catch (error) {
      console.error("Failed to send login link.", error);
      res.status(503).json({ error: "email_unavailable" });
      return;
    }

    res.status(202).json({ email });
  });

  router.get("/api/auth/verify-login", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      res.redirect(`${options.siteOrigin}/?signin=invalid`);
      return;
    }

    let claims;
    try {
      claims = options.tokenService.verifyLoginToken(token);
    } catch {
      res.redirect(`${options.siteOrigin}/?signin=expired`);
      return;
    }

    const stored = await options.userService.consumeLoginToken(claims.jti);
    if (!stored || stored.email !== claims.email) {
      res.redirect(`${options.siteOrigin}/?signin=expired`);
      return;
    }

    const user = await options.userService.getUser(claims.sub);
    if (!user) {
      res.redirect(`${options.siteOrigin}/?signin=invalid`);
      return;
    }

    await options.userService.recordLogin(user.id);

    const sessionToken = options.tokenService.signSessionToken({ sub: user.id });
    res.cookie("session", sessionToken, {
      httpOnly: true,
      maxAge: options.sessionCookieMaxAgeMs,
      path: "/",
      sameSite: "lax",
      secure: options.secureCookies,
    });

    res.redirect(options.siteOrigin);
  });

  router.get("/api/auth/me", async (req, res) => {
    const session = req.cookies?.session;
    if (typeof session !== "string") {
      res.json({ user: null });
      return;
    }

    try {
      const claims = options.tokenService.verifySessionToken(session);
      const user = await options.userService.getUser(claims.sub);
      if (!user) {
        res.json({ user: null });
        return;
      }
      res.json({ user: { id: user.id, email: user.data.email } });
    } catch {
      res.json({ user: null });
    }
  });

  return router;
}