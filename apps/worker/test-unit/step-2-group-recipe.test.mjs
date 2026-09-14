import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ outputs: [], sessions: [] }));

vi.mock("node-llama-cpp", () => ({
  LlamaChatSession: class {
    constructor(options) {
      this.options = options;
      this.prompts = [];
      state.sessions.push(this);
    }

    async prompt(recipe, options) {
      this.prompts.push({ recipe, options });
      return state.outputs.shift();
    }
  },
}));

import { groupRecipe } from "../src/step-2-group-recipe.mjs";

function createDependencies() {
  const context = { dispose: vi.fn(), getSequence: vi.fn(() => "sequence") };
  const grammar = {};
  const llama = { createGrammarForJsonSchema: vi.fn(async (schema) => grammar) };
  const model = {
    createContext: vi.fn(async () => context),
    tokenize: vi.fn(() => [1, 2]),
  };

  return { context, grammar, llama, model };
}

describe("groupRecipe", () => {
  it("uses inferred headers to constrain component names in the grammar", async () => {
    state.outputs = [JSON.stringify([{
      component: { name: "Cake", type: "noun" },
      ingredients: ["200g flour"],
      directions: null,
    }])];
    state.sessions = [];
    const { context, grammar, llama, model } = createDependencies();

    const result = await groupRecipe({ llama, model, recipe: "recipe source", headers: ["Cake"] });

    expect(result.groups).toEqual([{
      component: { name: "Cake", type: "noun" },
      ingredients: ["200g flour"],
      directions: null,
    }]);
    const schema = llama.createGrammarForJsonSchema.mock.calls[0][0];
    expect(schema.items.properties.component).toEqual({
      oneOf: [
        expect.objectContaining({ properties: expect.objectContaining({ name: { enum: ["Cake"] } }) }),
        { type: "null" },
      ],
    });
    expect(state.sessions[0].prompts).toEqual([{
      recipe: "recipe source",
      options: { grammar, maxTokens: 8_192, temperature: 0 },
    }]);
    expect(context.dispose).toHaveBeenCalledOnce();
  });

  it("allows only null components when no headers are inferred", async () => {
    state.outputs = [JSON.stringify([{
      component: null,
      ingredients: ["200g flour"],
      directions: null,
    }])];
    state.sessions = [];
    const { llama, model } = createDependencies();

    await groupRecipe({ llama, model, recipe: "recipe source", headers: [] });

    const schema = llama.createGrammarForJsonSchema.mock.calls[0][0];
    expect(schema.items.properties.component).toEqual({ type: "null" });
  });
});
