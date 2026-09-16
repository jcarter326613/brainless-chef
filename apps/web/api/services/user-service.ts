import { randomUUID } from "node:crypto";

import type { LoginToken, User } from "@brainless-chef/database";

export interface StoredUser {
  id: string;
  data: User;
}

export interface StoredLoginToken {
  id: string;
  data: LoginToken;
}

export interface UserCollection {
  create(data: User): Promise<StoredUser>;
  get(id: string): Promise<StoredUser | undefined>;
  query(options: {
    where: ReadonlyArray<{ field: "email"; operator: "=="; value: string }>;
  }): Promise<StoredUser[]>;
  update(id: string, updater: (current: User) => User): Promise<User>;
}

export interface LoginTokenCollection {
  delete(id: string): Promise<void>;
  get(id: string): Promise<StoredLoginToken | undefined>;
  set(id: string, data: LoginToken): Promise<void>;
}

export interface AuthDatabase {
  collections: { loginTokens: LoginTokenCollection; users: UserCollection };
  transaction<Result>(
    operation: (database: { collections: AuthDatabase["collections"] }) => Promise<Result>,
  ): Promise<Result>;
}

export type PrepareLoginLinkResult =
  | { result: "created"; jti: string; user: StoredUser }
  | { result: "ready"; jti: string; user: StoredUser }
  | { result: "throttled"; retryAfterMs: number; user: StoredUser };

export function createUserService(
  database: AuthDatabase,
  options: { loginTokenTtlMs: number; resendCooldownMs: number },
) {
  const nowIso = () => new Date().toISOString();

  async function findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const matches = await database.collections.users.query({
      where: [{ field: "email", operator: "==", value: email }],
    });
    return matches[0];
  }

  return {
    async prepareLoginLink(email: string): Promise<PrepareLoginLinkResult> {
      let user = await findUserByEmail(email);
      let isNewUser = false;

      if (!user) {
        user = await database.collections.users.create({
          email,
          createdAt: nowIso(),
          lastLoginAt: null,
          lastLoginLinkSentAt: null,
          schemaVersion: "1.0",
        });
        isNewUser = true;
      } else if (user.data.lastLoginLinkSentAt !== null) {
        const elapsedMs = Date.now() - Date.parse(user.data.lastLoginLinkSentAt);
        if (elapsedMs < options.resendCooldownMs) {
          return {
            result: "throttled",
            retryAfterMs: options.resendCooldownMs - elapsedMs,
            user,
          };
        }
      }

      await database.collections.users.update(user.id, (current) => ({
        ...current,
        lastLoginLinkSentAt: nowIso(),
      }));

      const jti = randomUUID();
      await database.collections.loginTokens.set(jti, {
        email,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + options.loginTokenTtlMs).toISOString(),
        schemaVersion: "1.0",
      });

      return { result: isNewUser ? "created" : "ready", jti, user };
    },

    async consumeLoginToken(jti: string): Promise<LoginToken | undefined> {
      return database.transaction(async ({ collections }) => {
        const token = await collections.loginTokens.get(jti);
        if (!token) {
          return undefined;
        }
        await collections.loginTokens.delete(jti);
        if (Date.parse(token.data.expiresAt) <= Date.now()) {
          return undefined;
        }
        return token.data;
      });
    },

    async getUser(id: string): Promise<StoredUser | undefined> {
      return database.collections.users.get(id);
    },

    async recordLogin(id: string): Promise<void> {
      await database.collections.users.update(id, (current) => ({
        ...current,
        lastLoginAt: nowIso(),
      }));
    },
  };
}

export type UserService = ReturnType<typeof createUserService>;