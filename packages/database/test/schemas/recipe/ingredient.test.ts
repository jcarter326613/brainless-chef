import { describe, expect, it } from "vitest";

import { ingredientSchema } from "../../../src/schemas/index.js";

describe("ingredientSchema", () => {
  it("accepts a named ingredient", () => {
    expect(ingredientSchema.parse({ name: "Flour" })).toEqual({ name: "Flour" });
  });

  it.each([{ name: "" }, { name: "   " }, { name: "Flour", unexpected: true }])(
    "rejects an invalid ingredient",
    (ingredient) => {
      expect(ingredientSchema.safeParse(ingredient).success).toBe(false);
    },
  );
});
