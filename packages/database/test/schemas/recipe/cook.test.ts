import { describe, expect, it } from "vitest";

import { cookTaskSchema } from "../../../src/schemas/index.js";

describe("cookTaskSchema", () => {
  it("allows a non-material cook task with a textual completion condition", () => {
    expect(
      cookTaskSchema.parse({
        action: { type: "preheat" },
        completion: "until the oven reaches 425 F",
        duration: null,
        id: "cook-preheat-oven",
        inputs: [],
        instruction: "Preheat the oven to 425 F.",
        output: null,
        tools: [],
      }),
    ).toMatchObject({
      completion: "until the oven reaches 425 F",
      output: null,
    });
  });

  it("rejects a backwards duration range", () => {
    expect(
      cookTaskSchema.safeParse({
        action: { type: "rest" },
        completion: null,
        duration: {
          attention: "passive",
          maxSeconds: 30,
          minSeconds: 60,
          timerRecommended: true,
        },
        id: "cook-rest",
        inputs: [],
        instruction: "Rest the food.",
        output: null,
        tools: [],
      }).success,
    ).toBe(false);
  });
});
