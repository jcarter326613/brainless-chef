import { createSigner, createVerifier } from "fast-jwt";

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export interface LoginTokenClaims {
  email: string;
  jti: string;
  sub: string;
}

export interface SessionTokenClaims {
  sub: string;
}

export function createTokenService(secret: string) {
  const signLogin = createSigner({ key: secret, algorithm: "HS256", expiresIn: "15m" });
  const verifyLogin = createVerifier({ key: secret, algorithms: ["HS256"], allowedAud: "login" });
  const signSession = createSigner({ key: secret, algorithm: "HS256", expiresIn: "60d" });
  const verifySession = createVerifier({ key: secret, algorithms: ["HS256"], allowedAud: "session" });

  return {
    signLoginToken(claims: LoginTokenClaims): string {
      return signLogin({ ...claims, aud: "login" });
    },
    verifyLoginToken(token: string): LoginTokenClaims {
      return verifyLogin(token) as LoginTokenClaims;
    },
    signSessionToken(claims: SessionTokenClaims): string {
      return signSession({ ...claims, aud: "session" });
    },
    verifySessionToken(token: string): SessionTokenClaims {
      return verifySession(token) as SessionTokenClaims;
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;