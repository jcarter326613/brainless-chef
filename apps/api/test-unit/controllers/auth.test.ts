import type { LoginToken, User } from "@brainless-chef/database";
import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { AuthController } from "../../src/controllers/auth.js";
import type { Mailer } from "../../src/services/mail-service.js";
import {
  LOGIN_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  TokenService,
} from "../../src/services/token-service.js";
import {
  type AuthDatabase,
  type LoginTokenCollection,
  type UserCollection,
  UserService,
} from "../../src/services/user-service.js";

const secret = "Y".repeat(44);
const host = "https://gateway.example.test";
const publicApiUrl = `${host}/api`;

class FakeMailer implements Mailer {
  fail = false;
  readonly sent: Array<{ loginUrl: string; to: string }> = [];

  async sendLoginLink(options: { to: string; loginUrl: string }): Promise<void> {
    if (this.fail) {
      throw new Error("mailer unavailable");
    }
    this.sent.push(options);
  }
}

class MemoryDatabase implements AuthDatabase {
  readonly users = new Map<string, User>();
  readonly loginTokens = new Map<string, LoginToken>();
  private nextUserId = 1;
  private nextTokenId = 1;

  readonly usersCollection: UserCollection = {
    create: async (data) => {
      const id = `user-${this.nextUserId++}`;
      this.users.set(id, data);
      return { data, id };
    },
    get: async (id) => {
      const data = this.users.get(id);
      return data === undefined ? undefined : { data, id };
    },
    query: async ({ where }) => {
      const filter = where[0];
      for (const [id, data] of this.users) {
        if (data[filter.field] === filter.value) {
          return [{ data, id }];
        }
      }
      return [];
    },
    patch: async (id, updater) => {
      const current = this.users.get(id);
      if (current === undefined) {
        throw new Error(`Missing user ${id}`);
      }
      this.users.set(id, { ...current, ...updater(current) });
    },
  };

  readonly loginTokensCollection: LoginTokenCollection = {
    create: async (data) => {
      const id = `token-${this.nextTokenId++}`;
      this.loginTokens.set(id, data);
      return { data, id };
    },
    delete: async (id) => {
      this.loginTokens.delete(id);
    },
    get: async (id) => {
      const data = this.loginTokens.get(id);
      return data === undefined ? undefined : { data, id };
    },
  };

  collections = {
    loginTokens: this.loginTokensCollection,
    users: this.usersCollection,
  };

  async transaction<Result>(
    operation: (database: {
      collections: { loginTokens: LoginTokenCollection; users: UserCollection };
    }) => Promise<Result>,
  ): Promise<Result> {
    return operation({ collections: this.collections });
  }
}

function makeController() {
  const database = new MemoryDatabase();
  const userService = new UserService(database, {
    loginTokenTtlMs: LOGIN_TOKEN_TTL_MS,
    resendCooldownMs: 60 * 1000,
  });
  const tokenService = new TokenService(secret);
  const mailer = new FakeMailer();
  const controller = new AuthController({
    mailer,
    publicApiUrl,
    secureCookies: true,
    sessionCookieMaxAgeMs: SESSION_TTL_MS,
    tokenService,
    userService,
  });
  return { controller, database, mailer, tokenService, userService };
}

class FakeRes {
  statusCode = 200;
  body: unknown;
  setHeaders = new Map<string, string>();
  cookies: Array<{ name: string; value: string }> = [];
  clearedCookies: Array<{ name: string; options: object }> = [];
  redirectLocation: string | undefined;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown): this {
    this.body = payload;
    return this;
  }

  set(name: string, value: string): this {
    this.setHeaders.set(name, value);
    return this;
  }

  cookie(name: string, value: string): this {
    this.cookies.push({ name, value });
    return this;
  }

  clearCookie(name: string, options: object): this {
    this.clearedCookies.push({ name, options });
    return this;
  }

  end(): this {
    return this;
  }

  redirect(location: string): this {
    this.redirectLocation = location;
    return this;
  }
}

function req(partial: Partial<Request>): Request {
  return partial as unknown as Request;
}

describe("AuthController", () => {
  describe("startLogin", () => {
    it("rejects an invalid email", async () => {
      const { controller, mailer } = makeController();
      const res = new FakeRes();

      await controller.startLogin(req({ body: { email: "not-an-email" } }), res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "invalid_email" });
      expect(mailer.sent).toHaveLength(0);
    });

    it("sends a login link and returns the normalized email", async () => {
      const { controller, mailer } = makeController();
      const res = new FakeRes();

      await controller.startLogin(req({ body: { email: "NEW@Example.com" } }), res as unknown as Response);

      expect(res.statusCode).toBe(202);
      expect(res.body).toEqual({ email: "new@example.com" });
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0].to).toBe("new@example.com");
      const loginUrlPrefix = `${publicApiUrl}/auth/verify-login?token=`;
      expect(mailer.sent[0].loginUrl.startsWith(loginUrlPrefix)).toBe(true);
      expect(mailer.sent[0].loginUrl.slice(loginUrlPrefix.length)).toMatch(/^[\w.-]+$/);
    });

    it("throttles repeat requests and sets Retry-After", async () => {
      const { controller } = makeController();
      const first = new FakeRes();
      await controller.startLogin(req({ body: { email: "a@example.com" } }), first as unknown as Response);
      expect(first.statusCode).toBe(202);

      const second = new FakeRes();
      await controller.startLogin(req({ body: { email: "a@example.com" } }), second as unknown as Response);

      expect(second.statusCode).toBe(429);
      expect(second.setHeaders.get("Retry-After")).toBe("60");
      expect(second.body).toMatchObject({ error: "login_link_throttled" });
    });

    it("returns 503 when the mailer fails", async () => {
      const { controller, mailer } = makeController();
      mailer.fail = true;
      const res = new FakeRes();

      await controller.startLogin(req({ body: { email: "a@example.com" } }), res as unknown as Response);

      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: "email_unavailable" });
    });
  });

  describe("verifyLogin", () => {
    it("redirects with signin=invalid when no token is present", async () => {
      const { controller } = makeController();
      const res = new FakeRes();

      await controller.verifyLogin(req({ query: {} }), res as unknown as Response);

      expect(res.redirectLocation).toBe(`${host}/?signin=invalid`);
    });

    it("redirects with signin=expired for an invalid token", async () => {
      const { controller, tokenService } = makeController();
      const valid = tokenService.signLoginToken({
        email: "a@example.com",
        jti: "missing-jti",
        sub: "user-1",
      });
      const res = new FakeRes();

      await controller.verifyLogin(req({ query: { token: valid } }), res as unknown as Response);

      expect(res.redirectLocation).toBe(`${host}/?signin=expired`);
    });

    it("signs the user in and sets the session cookie", async () => {
      const { controller, tokenService, userService } = makeController();
      const prepared = await userService.prepareLoginLink("a@example.com");
      const loginToken = tokenService.signLoginToken({
        email: "a@example.com",
        jti: prepared.jti,
        sub: prepared.user.id,
      });
      const res = new FakeRes();

      await controller.verifyLogin(req({ query: { token: loginToken } }), res as unknown as Response);

      expect(res.redirectLocation).toBe(host);
      expect(res.cookies).toHaveLength(1);
      expect(res.cookies[0].name).toBe("session");
      expect(res.cookies[0].value).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    it("redirects with signin=expired on token replay", async () => {
      const { controller, tokenService, userService } = makeController();
      const prepared = await userService.prepareLoginLink("a@example.com");
      const loginToken = tokenService.signLoginToken({
        email: "a@example.com",
        jti: prepared.jti,
        sub: prepared.user.id,
      });
      const first = new FakeRes();
      await controller.verifyLogin(req({ query: { token: loginToken } }), first as unknown as Response);
      expect(first.redirectLocation).toBe(host);

      const replay = new FakeRes();
      await controller.verifyLogin(req({ query: { token: loginToken } }), replay as unknown as Response);

      expect(replay.redirectLocation).toBe(`${host}/?signin=expired`);
    });
  });

  describe("me", () => {
    it("reports no user without a session cookie", async () => {
      const { controller } = makeController();
      const res = new FakeRes();

      await controller.me(req({ cookies: {} }), res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ user: null });
    });

    it("returns the current user for a valid session", async () => {
      const { controller, tokenService, userService } = makeController();
      const prepared = await userService.prepareLoginLink("a@example.com");
      const loginToken = tokenService.signLoginToken({
        email: "a@example.com",
        jti: prepared.jti,
        sub: prepared.user.id,
      });
      const loginRes = new FakeRes();
      await controller.verifyLogin(req({ query: { token: loginToken } }), loginRes as unknown as Response);
      const session = loginRes.cookies[0].value;

      const res = new FakeRes();
      await controller.me(req({ cookies: { session } }), res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ user: { email: "a@example.com", id: prepared.user.id } });
    });

    it("reports no user for an invalid session", async () => {
      const { controller } = makeController();
      const res = new FakeRes();

      await controller.me(req({ cookies: { session: "garbage" } }), res as unknown as Response);

      expect(res.body).toEqual({ user: null });
    });

    it("reports no user when the session user no longer exists", async () => {
      const { controller, tokenService } = makeController();
      const session = tokenService.signSessionToken({ sub: "ghost-user" });
      const res = new FakeRes();

      await controller.me(req({ cookies: { session } }), res as unknown as Response);

      expect(res.body).toEqual({ user: null });
    });
  });

  describe("signOut", () => {
    it("expires the session cookie", () => {
      const { controller } = makeController();
      const res = new FakeRes();

      controller.signOut(req({}), res as unknown as Response);

      expect(res.statusCode).toBe(204);
      expect(res.clearedCookies).toEqual([
        {
          name: "session",
          options: { httpOnly: true, path: "/", sameSite: "lax", secure: true },
        },
      ]);
    });
  });
});
