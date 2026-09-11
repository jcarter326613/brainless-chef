import { describe, expect, it } from "vitest";

import { parseRecipeDraft } from "../src/infer.js";

const validDraft = JSON.stringify({
  title: "Quick flatbread",
  ingredients: [
    { name: "flour", quantity: 1, unit: "cup" },
    { name: "water", quantity: 0.5, unit: "cup" },
    { name: "oil", quantity: null, unit: null },
  ],
  instructions: ["Mix the flour and water.", "Cook in a dry pan."],
});

describe("parseRecipeDraft", () => {
  it("accepts normalized numeric quantities and absent measurements", () => {
    expect(parseRecipeDraft(validDraft)).toEqual({
      title: "Quick flatbread",
      ingredients: [
        { name: "flour", quantity: 1, unit: "cup" },
        { name: "water", quantity: 0.5, unit: "cup" },
        { name: "oil", quantity: null, unit: null },
      ],
      instructions: ["Mix the flour and water.", "Cook in a dry pan."],
    });
  });

  it("rejects quantities that include their units", () => {
    expect(() =>
      parseRecipeDraft(
        validDraft.replace('"quantity":1,"unit":"cup"', '"quantity":"1 cup","unit":"cup"'),
      ),
    ).toThrow("quantity must be a positive number or null");
  });

  it("rejects an inferred unit without an amount", () => {
    expect(() =>
      parseRecipeDraft(
        validDraft.replace('"quantity":null,"unit":null', '"quantity":null,"unit":"cup"'),
      ),
    ).toThrow("cannot have a unit without a quantity");
  });

  it("rejects unknown fields that could hide malformed model output", () => {
    expect(() =>
      parseRecipeDraft(validDraft.replace('"instructions":', '"invented":true,"instructions":')),
    ).toThrow("invalid recipe object");
  });

  it("rejects instruction metadata prefixes", () => {
    expect(() =>
      parseRecipeDraft(validDraft.replace("Mix the flour and water.", "description: Mix the flour and water.")),
    ).toThrow("must not contain a metadata prefix");
  });
});
