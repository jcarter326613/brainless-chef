import { describe, expect, it } from "vitest";

import { toolSchema } from "../../../src/schemas/index.js";

describe("toolSchema", () => {
  it("normalizes tool types while preserving a physical resource slot", () => {
    expect(
      toolSchema.parse({
        id: "tool-bowl-a",
        label: "Bowl A",
        name: "Small prep bowl",
        size: "2 quart",
        type: "BOWL",
      }),
    ).toMatchObject({ id: "tool-bowl-a", size: "2 quart", type: "bowl" });
  });

  it("rejects missing required tool fields", () => {
    expect(toolSchema.safeParse({ id: "tool-bowl-a", name: "Bowl", size: null }).success).toBe(false);
  });
});
