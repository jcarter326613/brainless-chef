import { createSigner } from "fast-jwt";
import { describe, expect, it } from "vitest";

import { createTokenService, SESSION_TTL_MS } from "../api/services/token-service.js";

const secret = "Z".repeat(44);

describe("TokenService", () => {
  it("round-trips a login token", () => {
    const tokens = createTokenService(secret);
    const token = tokens.signLoginToken({ email: "a@example.com", jti: "jti-1", sub: "user-1" });

    expect(tokens.verifyLoginToken(token)).toMatchObject({
      aud: "login",
      email: "a@example.com",
      jti: "jti-1",
      sub: "user-1",
    });
  });

  it("round-trips a session token", () => {
    const tokens = createTokenService(secret);
    const token = tokens.signSessionToken({ sub: "user-1" });

    expect(tokens.verifySessionToken(token)).toMatchObject({ aud: "session", sub: "user-1" });
  });

  it("rejects a login token used as a session token", () => {
    const tokens = createTokenService(secret);
    const loginToken = tokens.signLoginToken({ email: "a@example.com", jti: "jti-1", sub: "user-1" });

    expect(() => tokens.verifySessionToken(loginToken)).toThrow();
  });

  it("rejects an expired token", () => {
    const tokens = createTokenService(secret);
    const expired = createSigner({
      key: secret,
      algorithm: "HS256",
      expiresIn: "-1s",
    })({ aud: "login", email: "a@example.com", jti: "jti-1", sub: "user-1" });

    expect(() => tokens.verifyLoginToken(expired)).toThrow();
  });

  it("exposes the session cookie TTL in milliseconds", () => {
    expect(SESSION_TTL_MS).toBe(60 * 24 * 60 * 60 * 1000);
  });
});