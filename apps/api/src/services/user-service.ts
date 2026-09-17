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
  patch(id: string, updater: (current: User) => Partial<User>): Promise<void>;
  query(options: {
    where: ReadonlyArray<{ field: "email"; operator: "=="; value: string }>;
  }): Promise<StoredUser[]>;
}

export interface LoginTokenCollection {
  create(data: LoginToken): Promise<StoredLoginToken>;
  delete(id: string): Promise<void>;
  get(id: string): Promise<StoredLoginToken | undefined>;
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

export interface UserServiceOptions {
  loginTokenTtlMs: number;
  resendCooldownMs: number;
}

export class UserService {
  private readonly database: AuthDatabase;
  private readonly loginTokenTtlMs: number;
  private readonly resendCooldownMs: number;

  constructor(database: AuthDatabase, options: UserServiceOptions) {
    this.database = database;
    this.loginTokenTtlMs = options.loginTokenTtlMs;
    this.resendCooldownMs = options.resendCooldownMs;
  }

  async prepareLoginLink(email: string): Promise<PrepareLoginLinkResult> {
    let user = await this.findUserByEmail(email);
    let isNewUser = false;

    if (!user) {
      user = await this.database.collections.users.create({
        email,
        createdAtEpoch: this.nowEpochMs(),
        lastLoginAtEpoch: null,
        lastLoginLinkSentAtEpoch: null,
        schemaVersion: "2.0",
      });
      isNewUser = true;
    } else if (user.data.lastLoginLinkSentAtEpoch !== null) {
      const elapsedMs = Date.now() - user.data.lastLoginLinkSentAtEpoch;
      if (elapsedMs < this.resendCooldownMs) {
        return {
          result: "throttled",
          retryAfterMs: this.resendCooldownMs - elapsedMs,
          user,
        };
      }
    }

    await this.database.collections.users.patch(user.id, () => ({
      lastLoginLinkSentAtEpoch: this.nowEpochMs(),
    }));

    const token = await this.database.collections.loginTokens.create({
      email,
      createdAtEpoch: this.nowEpochMs(),
      expiresAtEpoch: Date.now() + this.loginTokenTtlMs,
      schemaVersion: "2.0",
    });
    const jti = token.id;

    return { result: isNewUser ? "created" : "ready", jti, user };
  }

  async consumeLoginToken(jti: string): Promise<LoginToken | undefined> {
    return this.database.transaction(async ({ collections }) => {
      const token = await collections.loginTokens.get(jti);
      if (!token) {
        return undefined;
      }
      await collections.loginTokens.delete(jti);
      if (token.data.expiresAtEpoch <= Date.now()) {
        return undefined;
      }
      return token.data;
    });
  }

  async getUser(id: string): Promise<StoredUser | undefined> {
    return this.database.collections.users.get(id);
  }

  async recordLogin(id: string): Promise<void> {
    await this.database.collections.users.patch(id, () => ({
      lastLoginAtEpoch: this.nowEpochMs(),
    }));
  }

  private nowEpochMs(): number {
    return Date.now();
  }

  private async findUserByEmail(email: string): Promise<StoredUser | undefined> {
    const matches = await this.database.collections.users.query({
      where: [{ field: "email", operator: "==", value: email }],
    });
    return matches[0];
  }
}