import { describe, expect, it } from "vitest";

import { prepTaskSchema } from "../../../src/schemas/index.js";

describe("prepTaskSchema", () => {
  it("requires an explicit allocation for raw ingredient inputs", () => {
    const task = {
      action: { type: "measure" },
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
});
