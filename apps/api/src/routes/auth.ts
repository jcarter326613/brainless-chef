import { Router } from "express";

import { AuthController, type AuthControllerOptions } from "../controllers/auth.js";

export function createAuthRouter(options: AuthControllerOptions): Router {
  const router = Router();

  const auth = new AuthController(options);

  router.post("/api/auth/start-login", (req, res) => auth.startLogin(req, res));
  router.get("/api/auth/verify-login", (req, res) => auth.verifyLogin(req, res));
  router.get("/api/auth/me", (req, res) => auth.me(req, res));

  return router;
}