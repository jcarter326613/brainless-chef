import type { Request, Response } from "express";
import { z } from "zod";

import type { Mailer } from "../services/mail-service.js";
import type { TokenService } from "../services/token-service.js";
import type { UserService } from "../services/user-service.js";

const emailSchema = z.object({ email: z.email() });

export interface AuthControllerOptions {
  mailer: Mailer;
  secureCookies: boolean;
  sessionCookieMaxAgeMs: number;
  siteOrigin: string;
  tokenService: TokenService;
  userService: UserService;
}

export class AuthController {
  private readonly mailer: Mailer;
  private readonly secureCookies: boolean;
  private readonly sessionCookieMaxAgeMs: number;
  private readonly siteOrigin: string;
  private readonly tokenService: TokenService;
  private readonly userService: UserService;

  constructor(options: AuthControllerOptions) {
    this.mailer = options.mailer;
    this.secureCookies = options.secureCookies;
    this.sessionCookieMaxAgeMs = options.sessionCookieMaxAgeMs;
    this.siteOrigin = options.siteOrigin;
    this.tokenService = options.tokenService;
    this.userService = options.userService;
  }

  async startLogin(req: Request, res: Response): Promise<void> {
    const parsed = emailSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_email" });
      return;
    }

    const email = parsed.data.email.toLowerCase();
    const prepared = await this.userService.prepareLoginLink(email);

    if (prepared.result === "throttled") {
      res.set("Retry-After", String(Math.ceil(prepared.retryAfterMs / 1000)));
      res.status(429).json({
        error: "login_link_throttled",
        retryAfterMs: prepared.retryAfterMs,
      });
      return;
    }

    const token = this.tokenService.signLoginToken({
      email,
      jti: prepared.jti,
      sub: prepared.user.id,
    });
    const loginUrl = `${this.siteOrigin}/api/auth/verify-login?token=${encodeURIComponent(token)}`;

    try {
      await this.mailer.sendLoginLink({ to: email, loginUrl });
    } catch (error) {
      console.error("Failed to send login link.", error);
      res.status(503).json({ error: "email_unavailable" });
      return;
    }

    res.status(202).json({ email });
  }

  async verifyLogin(req: Request, res: Response): Promise<void> {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      res.redirect(`${this.siteOrigin}/?signin=invalid`);
      return;
    }

    let claims;
    try {
      claims = this.tokenService.verifyLoginToken(token);
    } catch {
      res.redirect(`${this.siteOrigin}/?signin=expired`);
      return;
    }

    const stored = await this.userService.consumeLoginToken(claims.jti);
    if (!stored || stored.email !== claims.email) {
      res.redirect(`${this.siteOrigin}/?signin=expired`);
      return;
    }

    const user = await this.userService.getUser(claims.sub);
    if (!user) {
      res.redirect(`${this.siteOrigin}/?signin=invalid`);
      return;
    }

    await this.userService.recordLogin(user.id);

    const sessionToken = this.tokenService.signSessionToken({ sub: user.id });
    res.cookie("session", sessionToken, {
      httpOnly: true,
      maxAge: this.sessionCookieMaxAgeMs,
      path: "/",
      sameSite: "lax",
      secure: this.secureCookies,
    });

    res.redirect(this.siteOrigin);
  }

  async me(req: Request, res: Response): Promise<void> {
    const session = req.cookies?.session;
    if (typeof session !== "string") {
      res.json({ user: null });
      return;
    }

    try {
      const claims = this.tokenService.verifySessionToken(session);
      const user = await this.userService.getUser(claims.sub);
      if (!user) {
        res.json({ user: null });
        return;
      }
      res.json({ user: { id: user.id, email: user.data.email } });
    } catch {
      res.json({ user: null });
    }
  }
}