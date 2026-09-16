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
      tools: [],
    };

    expect(prepTaskSchema.parse(task).action).toBe("julienne");
    expect(prepTaskSchema.safeParse({ ...task, action: "" }).success).toBe(false);
  });

  it("requires an allocation quantity for prep task inputs", () => {
    const task = {
      action: "combine",
      id: "prep-combine-salt",
      inputs: [{ id: "prep-measure-salt", quantity: null, type: "prepTask" }],
      instruction: "Combine the measured salt.",
      tools: [],
    };

    expect(prepTaskSchema.parse(task).inputs[0]).toMatchObject({ quantity: null });
    expect(prepTaskSchema.safeParse({
      ...task,
      inputs: [{ id: "prep-measure-salt", type: "prepTask" }],
    }).success).toBe(false);
  });
});
