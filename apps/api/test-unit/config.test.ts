import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

function validEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    PORT: "8080",
    FIRESTORE_DATABASE_ID: "brainless-chef",
    JWT_SECRET: "Y".repeat(44),
    MAIL_FROM: "no-reply@example.test",
    MAILTRAP_API_TOKEN: "test-token",
    MAILTRAP_MODE: "sandbox",
    COOKIE_SECURE: "true",
    SITE_ORIGIN: "https://example.test",
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
      secureCookies: true,
      siteOrigin: "https://example.test",
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
    expect(loadConfig(validEnv({ SITE_ORIGIN: " https://example.test " })).siteOrigin).toBe(
      "https://example.test",
    );
  });

  it("rejects a missing JWT_SECRET", () => {
    expect(() => loadConfig(without(validEnv(), "JWT_SECRET"))).toThrow();
  });

  it("rejects a short JWT_SECRET", () => {
    expect(() => loadConfig(validEnv({ JWT_SECRET: "too-short" }))).toThrow();
  });

  it("rejects an invalid site origin", () => {
    expect(() => loadConfig(validEnv({ SITE_ORIGIN: "not-a-url" }))).toThrow();
  });

  it("rejects an unsupported mailtrap mode", () => {
    expect(() => loadConfig(validEnv({ MAILTRAP_MODE: "invalid" }))).toThrow();
  });
});