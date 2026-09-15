import { describe, expect, it } from "vitest";

import { cookTaskSchema } from "../../../src/schemas/index.js";

describe("cookTaskSchema", () => {
  it("allows a non-material cook task with a textual completion condition", () => {
    expect(
      cookTaskSchema.parse({
        action: "preheat",
        completion: "until the oven reaches 425 F",
        duration: null,
        id: "cook-preheat-oven",
        inputs: [],
        instruction: "Preheat the oven to 425 F.",
        tools: [],
      }),
    ).toMatchObject({
      completion: "until the oven reaches 425 F",
    });
  });

  it("allows an arbitrary non-empty action", () => {
    const task = {
      action: "temper",
      completion: null,
      duration: null,
      id: "cook-temper-chocolate",
      inputs: [],
      instruction: "Temper the chocolate.",
      tools: [],
    };

    expect(cookTaskSchema.parse(task).action).toBe("temper");
    expect(cookTaskSchema.safeParse({ ...task, action: "" }).success).toBe(false);
  });

  it("normalizes allocation quantities on task inputs", () => {
    const task = {
      action: "add",
      completion: null,
      duration: null,
      id: "cook-add-sauce",
      inputs: [{ id: "cook-make-sauce", quantity: { kind: "exact", unit: "CUP", value: 0.5 }, type: "cookTask" }],
      instruction: "Add half a cup of sauce.",
      tools: [],
    };

    expect(cookTaskSchema.parse(task).inputs[0]).toMatchObject({
      quantity: { kind: "exact", unit: "cup", value: 0.5 },
    });
    expect(cookTaskSchema.safeParse({
      ...task,
      inputs: [{ id: "cook-make-sauce", type: "cookTask" }],
    }).success).toBe(false);
  });

  it("rejects a backwards duration range", () => {
    expect(
      cookTaskSchema.safeParse({
        action: "rest",
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
        tools: [],
      }).success,
    ).toBe(false);
  });
});
