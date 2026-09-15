import { describe, expect, it } from "vitest";

import { createRelationships } from "../src/step-5-create-relationships.js";

describe("createRelationships", () => {
  it("indexes ingredients and preserves directions while relationships are unpopulated", () => {
    const directions = [{ component: null, direction: "Chop the onion.", order: 0, source: "Chop the onion." }];

    const result = createRelationships({
      directions,
      ingredientGroups: [
        {
          component: { name: "Sauce", type: "noun" },
          ingredients: [
            { name: "onion", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "each", value: 1 } },
          ],
        },
        {
          component: null,
          ingredients: [
            { name: "oil", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "tbsp", value: 1 } },
          ],
        },
      ],
    });

    expect(result.directions).toBe(directions);
    expect(result.ingredients).toEqual([
      {
        component: { name: "Sauce", type: "noun" },
        index: 0,
        ingredient: { name: "onion", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "each", value: 1 } },
      },
      {
        component: null,
        index: 1,
        ingredient: { name: "oil", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "tbsp", value: 1 } },
      },
    ]);
    expect(result.relationships).toEqual([{ direction: directions[0], inputs: [] }]);
  });
});
