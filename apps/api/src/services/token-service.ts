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

type TokenSigner = (payload: Record<string, unknown>) => string;
type TokenVerifier = (token: string) => Record<string, unknown>;

export class TokenService {
  private readonly signLogin: TokenSigner;
  private readonly verifyLogin: TokenVerifier;
  private readonly signSession: TokenSigner;
  private readonly verifySession: TokenVerifier;

  constructor(secret: string) {
    this.signLogin = createSigner({
      key: secret,
      algorithm: "HS256",
      expiresIn: LOGIN_TOKEN_TTL_MS,
    }) as TokenSigner;
    this.verifyLogin = createVerifier({
      key: secret,
      algorithms: ["HS256"],
      allowedAud: "login",
    }) as TokenVerifier;
    this.signSession = createSigner({
      key: secret,
      algorithm: "HS256",
      expiresIn: SESSION_TTL_MS,
    }) as TokenSigner;
    this.verifySession = createVerifier({
      key: secret,
      algorithms: ["HS256"],
      allowedAud: "session",
    }) as TokenVerifier;
  }

  signLoginToken(claims: LoginTokenClaims): string {
    return this.signLogin({ ...claims, aud: "login" });
  }

  verifyLoginToken(token: string): LoginTokenClaims {
    return this.verifyLogin(token) as unknown as LoginTokenClaims;
  }

  signSessionToken(claims: SessionTokenClaims): string {
    return this.signSession({ ...claims, aud: "session" });
  }

  verifySessionToken(token: string): SessionTokenClaims {
    return this.verifySession(token) as unknown as SessionTokenClaims;
  }
}