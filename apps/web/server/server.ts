import path from "node:path";

import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const port = Number(process.env.PORT ?? 8080);
const apiServiceUrl = process.env.API_SERVICE_URL;
if (!apiServiceUrl) {
  throw new Error("API_SERVICE_URL must be configured for the web proxy.");
}

const app = express();
app.disable("x-powered-by");

app.use(
  "/api",
  createProxyMiddleware({
    target: apiServiceUrl,
    changeOrigin: true,
  }),
);

const staticDir = path.resolve(import.meta.dirname, "..", "dist");
app.use(express.static(staticDir));
app.get("/*", (_req, res, next) => {
  res.sendFile(path.join(staticDir, "index.html"), (error) => {
    if (error) {
      next(error);
    }
  });
});

app.listen(port, () => {
  console.log(`Brainless Chef web server listening on port ${port}`);
});