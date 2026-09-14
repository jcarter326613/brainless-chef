import request from "supertest";
import { describe, it } from "vitest";

import { createApp } from "../src/app.js";

describe("API", () => {
  it("reports health", async () => {
    await request(createApp()).get("/health").expect(200, { status: "ok" });
  });
});
