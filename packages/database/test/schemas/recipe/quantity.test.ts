import { describe, expect, it } from "vitest";

import { ingredientQuantitySchema } from "../../../src/schemas/index.js";

describe("ingredientQuantitySchema", () => {
  it("normalizes numeric quantity units", () => {
    expect(
      ingredientQuantitySchema.parse({
        kind: "exact",
        packageSize: { unit: "OZ", value: 14.5 },
        unit: "CAN",
        value: 1,
      }),
    ).toMatchObject({ packageSize: { unit: "oz" }, unit: "can" });
  });

  it.each([
    { kind: "range", max: 1, min: 2, unit: "tbsp" },
    { kind: "exact", packageSize: null, unit: "", value: 1 },
    { kind: "to-taste", unit: "   " },
  ])("rejects an invalid quantity", (quantity) => {
    expect(ingredientQuantitySchema.safeParse(quantity).success).toBe(false);
  });
});
