import type { LoginToken, User } from "@brainless-chef/database";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type AuthDatabase,
  type LoginTokenCollection,
  type UserCollection,
  UserService,
} from "../../src/services/user-service.js";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const EPOCH = Date.parse("2026-01-01T00:00:00Z");

class MemoryDatabase implements AuthDatabase {
  readonly users = new Map<string, User>();
  readonly loginTokens = new Map<string, LoginToken>();
  private nextUserId = 1;

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

function makeHarness() {
  const database = new MemoryDatabase();
  const userService = new UserService(database, {
    loginTokenTtlMs: LOGIN_TOKEN_TTL_MS,
    resendCooldownMs: RESEND_COOLDOWN_MS,
  });
  return { database, userService };
}

describe("UserService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("prepareLoginLink", () => {
    it("creates a user and a login token on first use", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(EPOCH);
      const { database, userService } = makeHarness();

      const result = await userService.prepareLoginLink("a@example.com");

      expect(result.result).toBe("created");
      expect(result.user.id).toBe("user-1");
      expect(result.user.data).toEqual({
        email: "a@example.com",
        createdAtEpoch: EPOCH,
        lastLoginAtEpoch: null,
        lastLoginLinkSentAtEpoch: null,
        schemaVersion: "2.0",
      });

      const storedToken = database.loginTokens.get(result.jti);
      expect(storedToken).toEqual({
        email: "a@example.com",
        createdAtEpoch: EPOCH,
        expiresAtEpoch: EPOCH + LOGIN_TOKEN_TTL_MS,
        schemaVersion: "2.0",
      });

      const storedUser = database.users.get(result.user.id);
      expect(storedUser?.lastLoginLinkSentAtEpoch).toBe(EPOCH);
    });

    it("reports ready for an existing user outside the cooldown", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(EPOCH);
      const { database, userService } = makeHarness();
      await userService.prepareLoginLink("a@example.com");
      vi.setSystemTime(EPOCH + RESEND_COOLDOWN_MS + 1);

      const result = await userService.prepareLoginLink("a@example.com");

      expect(result.result).toBe("ready");
      expect(database.users.size).toBe(1);
    });

    it("throttles repeat requests inside the cooldown window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(EPOCH);
      const { database, userService } = makeHarness();
      await userService.prepareLoginLink("a@example.com");

      const result = await userService.prepareLoginLink("a@example.com");

      expect(result.result).toBe("throttled");
      if (result.result === "throttled") {
        expect(result.retryAfterMs).toBe(RESEND_COOLDOWN_MS);
      }
      vi.setSystemTime(EPOCH + RESEND_COOLDOWN_MS + 1);

      const afterCooldown = await userService.prepareLoginLink("a@example.com");
      expect(afterCooldown.result).toBe("ready");
      expect(database.loginTokens.size).toBe(2);
    });
  });

  describe("consumeLoginToken", () => {
    it("returns the token once and deletes it", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(EPOCH);
      const { database, userService } = makeHarness();
      const prepared = await userService.prepareLoginLink("a@example.com");

      const consumed = await userService.consumeLoginToken(prepared.jti);

      expect(consumed?.email).toBe("a@example.com");
      expect(database.loginTokens.has(prepared.jti)).toBe(false);
      await expect(userService.consumeLoginToken(prepared.jti)).resolves.toBeUndefined();
    });

    it("rejects an expired token", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(EPOCH);
      const { database, userService } = makeHarness();
      const prepared = await userService.prepareLoginLink("a@example.com");
      vi.setSystemTime(EPOCH + LOGIN_TOKEN_TTL_MS + 1);

      await expect(userService.consumeLoginToken(prepared.jti)).resolves.toBeUndefined();
      expect(database.loginTokens.has(prepared.jti)).toBe(false);
    });

    it("returns undefined for an unknown token", async () => {
      const { userService } = makeHarness();
      await expect(userService.consumeLoginToken("missing")).resolves.toBeUndefined();
    });
  });

  describe("getUser", () => {
    it("returns the stored user", async () => {
      const { userService } = makeHarness();
      const prepared = await userService.prepareLoginLink("a@example.com");
      await expect(userService.getUser(prepared.user.id)).resolves.toBeDefined();
    });

    it("returns undefined for an unknown user", async () => {
      const { userService } = makeHarness();
      await expect(userService.getUser("missing")).resolves.toBeUndefined();
    });
  });

  describe("recordLogin", () => {
    it("records the login timestamp", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(EPOCH);
      const { database, userService } = makeHarness();
      const prepared = await userService.prepareLoginLink("a@example.com");
      const later = EPOCH + 5 * 60 * 1000;
      vi.setSystemTime(later);

      await userService.recordLogin(prepared.user.id);

      expect(database.users.get(prepared.user.id)?.lastLoginAtEpoch).toBe(later);
    });
  });
});