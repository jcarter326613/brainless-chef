import { describe, expect, it } from "vitest";

import { prepTaskSchema } from "../../../src/schemas/index.js";

describe("prepTaskSchema", () => {
  it("requires an explicit allocation for raw ingredient inputs", () => {
    const task = {
      action: "measure",
      id: "prep-measure-salt",
      inputs: [
        {
          id: "ingredient-salt",
          quantity: { kind: "exact", unit: "TSP", value: 1 },
          type: "ingredient",
        },
      ],
      instruction: "Measure the salt.",
      output: { id: "prep-object-salt", label: "Measured salt", locationToolId: null },
      tools: ["tool-measuring-spoons"],
    };

    expect(prepTaskSchema.parse(task)).toMatchObject({
      inputs: [{ quantity: { unit: "tsp" } }],
    });
    expect(
      prepTaskSchema.safeParse({
        ...task,
        inputs: [{ id: "ingredient-salt", type: "ingredient" }],
      }).success,
    ).toBe(false);
  });

  it("allows an arbitrary non-empty action", () => {
    const task = {
      action: "julienne",
      id: "prep-julienne-carrot",
      inputs: [
        {
          id: "ingredient-carrot",
          quantity: { kind: "exact", unit: "each", value: 1 },
          type: "ingredient",
        },
      ],
      instruction: "Julienne the carrot.",
      output: { id: "prep-object-carrot", label: "Julienned carrot", locationToolId: null },
      tools: [],
    };

    expect(prepTaskSchema.parse(task).action).toBe("julienne");
    expect(prepTaskSchema.safeParse({ ...task, action: "" }).success).toBe(false);
  });
});
