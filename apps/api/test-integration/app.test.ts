import type { LoginToken, User } from "@brainless-chef/database";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config/config.js";
import type { Mailer } from "../src/services/mail-service.js";
import type {
  AuthDatabase,
  LoginTokenCollection,
  StoredLoginToken,
  StoredUser,
  UserCollection,
} from "../src/services/user-service.js";

const secret = "Y".repeat(44);

interface TestContext {
  baseUrl: string;
  close(): Promise<void>;
  mailer: FakeMailer;
}

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

  readonly usersCollection: UserCollection = {
    create: async (data) => {
      const id = `user-${this.nextUserId++}`;
      this.users.set(id, data);
      return { id, data };
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
    update: async (id, updater) => {
      const current = this.users.get(id);
      if (current === undefined) {
        throw new Error(`Missing user ${id}`);
      }
      const updated = updater(current);
      this.users.set(id, updated);
      return updated;
    },
  };

  readonly loginTokensCollection: LoginTokenCollection = {
    delete: async (id) => {
      this.loginTokens.delete(id);
    },
    get: async (id) => {
      const data = this.loginTokens.get(id);
      return data === undefined ? undefined : { data, id };
    },
    set: async (id, data) => {
      this.loginTokens.set(id, data);
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

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    firestoreDatabaseId: "test",
    jwtSecret: secret,
    mailFrom: "no-reply@example.test",
    mailtrapApiToken: "test-token",
    mailtrapMode: "sandbox",
    secureCookies: false,
    siteOrigin: "https://example.test",
    ...overrides,
  };
}

async function startContext(overrides: Partial<AppConfig> = {}): Promise<{
  baseUrl: string;
  close(): Promise<void>;
  database: MemoryDatabase;
  mailer: FakeMailer;
}> {
  const config = makeConfig(overrides);
  const database = new MemoryDatabase();
  const mailer = new FakeMailer();
  const app = createApp({ config, database, mailer });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    database,
    mailer,
  };
}

function extractSessionCookie(setCookie: string | string[]): string | undefined {
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  const header = headers.find((value) => value.startsWith("session="));
  return header?.split(";")[0];
}

describe("web API routes", () => {
  let context: Awaited<ReturnType<typeof startContext>>;

  beforeEach(async () => {
    context = await startContext();
  });

  afterEach(async () => {
    await context.close();
  });

  it("reports health", async () => {
    const response = await fetch(`${context.baseUrl}/api/health`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns 404 json for unknown api routes", async () => {
    const response = await fetch(`${context.baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("sends a login link for a new user", async () => {
    const response = await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "NEW@Example.com" }),
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ email: "new@example.com" });
    expect(context.mailer.sent).toHaveLength(1);
    expect(context.mailer.sent[0].to).toBe("new@example.com");
    expect(context.mailer.sent[0].loginUrl).toMatch(
      /^https:\/\/example\.test\/api\/auth\/verify-login\?token=([\w-]+\.[\w-]+\.[\w-]+)/,
    );
    expect([...context.database.users.values()][0].email).toBe("new@example.com");
  });

  it("rejects an invalid email", async () => {
    const response = await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });

    expect(response.status).toBe(400);
    expect(context.mailer.sent).toHaveLength(0);
  });

  it("throttles rapid repeat login-link requests", async () => {
    await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com" }),
    });
    const second = await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com" }),
    });

    expect(second.status).toBe(429);
    expect(context.mailer.sent).toHaveLength(1);
  });

  it("returns 503 when the mailer fails", async () => {
    context.mailer.fail = true;

    const response = await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com" }),
    });

    expect(response.status).toBe(503);
  });

  it("completes the magic-link flow and signs the user in", async () => {
    await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com" }),
    });
    const loginUrl = new URL(context.mailer.sent[0].loginUrl);
    const token = loginUrl.searchParams.get("token")!;

    const redirect = await fetch(`${context.baseUrl}/api/auth/verify-login?token=${token}`, {
      redirect: "manual",
    });

    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("https://example.test");
    const sessionCookie = extractSessionCookie(redirect.headers.getSetCookie?.() ?? redirect.headers.get("set-cookie")!);
    expect(sessionCookie).toMatch(/^session=/);

    const me = await fetch(`${context.baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookie! },
    });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toEqual({
      user: { email: "a@example.com", id: "user-1" },
    });
  });

  it("consumes a login token only once", async () => {
    await fetch(`${context.baseUrl}/api/auth/start-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@example.com" }),
    });
    const token = new URL(context.mailer.sent[0].loginUrl).searchParams.get("token")!;

    const first = await fetch(`${context.baseUrl}/api/auth/verify-login?token=${token}`, { redirect: "manual" });
    expect(first.status).toBe(302);

    const replay = await fetch(`${context.baseUrl}/api/auth/verify-login?token=${token}`, { redirect: "manual" });
    expect(replay.status).toBe(302);
    expect(replay.headers.get("location")).toBe("https://example.test/?signin=expired");
  });

  it("redirects expired or invalid tokens", async () => {
    const response = await fetch(`${context.baseUrl}/api/auth/verify-login?token=garbage`, {
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.test/?signin=expired");
  });

  it("reports no user without a session cookie", async () => {
    const response = await fetch(`${context.baseUrl}/api/auth/me`);
    await expect(response.json()).resolves.toEqual({ user: null });
  });
});