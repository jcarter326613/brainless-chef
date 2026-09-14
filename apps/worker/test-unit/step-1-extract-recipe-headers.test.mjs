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

import { extractRecipeHeaders } from "../src/step-1-extract-recipe-headers.mjs";

function createDependencies() {
  const context = { dispose: vi.fn(), getSequence: vi.fn(() => "sequence") };
  const grammar = {};
  const llama = { createGrammarForJsonSchema: vi.fn(async (schema) => grammar) };
  const model = {
    createContext: vi.fn(async () => context),
    tokenize: vi.fn(() => [1, 2, 3]),
  };

  return { context, grammar, llama, model };
}

describe("extractRecipeHeaders", () => {
  it("returns ordered model-inferred headers and preserves the raw response", async () => {
    const output = JSON.stringify({
      analysis: "Recipe sections identified.",
      ingredientHeaders: ["Cake"],
      directionHeaders: ["Bake"],
    });
    state.outputs = [output];
    state.sessions = [];
    const { context, grammar, llama, model } = createDependencies();

    const result = await extractRecipeHeaders({ llama, model, recipe: "recipe source" });

    expect(result.headers).toEqual(["Cake", "Bake"]);
    expect(result.response).toEqual({
      analysis: "Recipe sections identified.",
      ingredientHeaders: ["Cake"],
      directionHeaders: ["Bake"],
    });
    expect(result.output).toBe(output);
    expect(result.requestTokens).toBe(3);
    expect(llama.createGrammarForJsonSchema).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({
        ingredientHeaders: expect.objectContaining({ type: "array" }),
        directionHeaders: expect.objectContaining({ type: "array" }),
      }),
    }));
    expect(state.sessions[0].prompts).toEqual([{
      recipe: "recipe source",
      options: { grammar, maxTokens: 4_096, temperature: 0 },
    }]);
    expect(context.dispose).toHaveBeenCalledOnce();
  });

  it("returns an empty header list when the model identifies no components", async () => {
    state.outputs = [JSON.stringify({ analysis: "No component headings.", ingredientHeaders: [], directionHeaders: [] })];
    state.sessions = [];
    const { llama, model } = createDependencies();

    const result = await extractRecipeHeaders({ llama, model, recipe: "recipe source" });

    expect(result.headers).toEqual([]);
  });
});
