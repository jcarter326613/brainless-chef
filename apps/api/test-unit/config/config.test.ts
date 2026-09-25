import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/config.js";

function validEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PORT: "8080",
    FIRESTORE_DATABASE_ID: "brainless-chef",
    JWT_SECRET: "Y".repeat(44),
    MAIL_FROM: "no-reply@example.test",
    MAILTRAP_API_TOKEN: "test-token",
    MAILTRAP_MODE: "sandbox",
    MAILTRAP_TEST_INBOX_ID: "1234567",
    PUBLIC_API_URL: "https://example.test/api",
    COOKIE_SECURE: "true",
    ...overrides,
  };
}

function without(env: NodeJS.ProcessEnv, key: string): NodeJS.ProcessEnv {
  const { [key]: _removed, ...rest } = env;
  return rest;
}

describe("loadConfig", () => {
  it("parses a complete valid environment", () => {
    expect(loadConfig(validEnv())).toEqual({
      port: 8080,
      firestoreDatabaseId: "brainless-chef",
      jwtSecret: "Y".repeat(44),
      mailFrom: "no-reply@example.test",
      mailtrapApiToken: "test-token",
      mailtrapMode: "sandbox",
      mailtrapTestInboxId: 1234567,
      publicApiUrl: "https://example.test/api",
      secureCookies: true,
    });
  });

  it("defaults port and secureCookies when not provided", () => {
    const config = loadConfig(without(without(validEnv(), "PORT"), "COOKIE_SECURE"));
    expect(config.port).toBe(8080);
    expect(config.secureCookies).toBe(true);
  });

  it("coerces a string port into a number", () => {
    expect(loadConfig(validEnv({ PORT: "3000" })).port).toBe(3000);
  });

  it("parses COOKIE_SECURE=false into false", () => {
    expect(loadConfig(validEnv({ COOKIE_SECURE: "false" })).secureCookies).toBe(false);
  });

  it("trims values before validating", () => {
    expect(loadConfig(validEnv({ PUBLIC_API_URL: " https://example.test/api " })).publicApiUrl).toBe(
      "https://example.test/api",
    );
  });

  it("rejects a missing JWT_SECRET", () => {
    expect(() => loadConfig(without(validEnv(), "JWT_SECRET"))).toThrow();
  });

  it("rejects a short JWT_SECRET", () => {
    expect(() => loadConfig(validEnv({ JWT_SECRET: "too-short" }))).toThrow();
  });

  it("rejects an invalid public API URL", () => {
    expect(() => loadConfig(validEnv({ PUBLIC_API_URL: "not-a-url" }))).toThrow();
  });

  it("rejects an unsupported mailtrap mode", () => {
    expect(() => loadConfig(validEnv({ MAILTRAP_MODE: "invalid" }))).toThrow();
  });

  it("requires a test inbox ID in sandbox mode", () => {
    expect(() => loadConfig(without(validEnv(), "MAILTRAP_TEST_INBOX_ID"))).toThrow();
  });

  it("does not require a test inbox ID in sending mode", () => {
    expect(loadConfig(without(validEnv({ MAILTRAP_MODE: "sending" }), "MAILTRAP_TEST_INBOX_ID")))
      .toMatchObject({ mailtrapMode: "sending", mailtrapTestInboxId: undefined });
  });
});
