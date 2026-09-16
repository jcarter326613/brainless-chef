import { describe, expect, it, vi } from "vitest";

import type { LlamaGrammar } from "node-llama-cpp";

import type { InferenceDependencies } from "../src/types.js";

interface PromptCall {
  recipe: string;
  options: unknown;
}

interface PromptSession {
  prompts: PromptCall[];
}

const state = vi.hoisted(() => ({ outputs: [] as string[], sessions: [] as PromptSession[] }));

vi.mock("node-llama-cpp", () => ({
  LlamaChatSession: class {
    prompts: PromptCall[] = [];

    constructor(_options: unknown) {
      state.sessions.push(this);
    }

    async prompt(recipe: string, options: unknown): Promise<string> {
      this.prompts.push({ recipe, options });
      const output = state.outputs.shift();
      if (output === undefined) throw new Error("No mock output configured.");
      return output;
    }
  },
}) as never);

import { extractRecipeHeaders } from "../src/step-1-extract-recipe-headers.js";

function createDependencies() {
  const context = { dispose: vi.fn(async () => undefined), getSequence: vi.fn(() => "sequence") };
  const grammar = {} as LlamaGrammar;
  const createGrammarForJsonSchema = vi.fn(async (_schema: never) => grammar);
  const llama: InferenceDependencies["llama"] = { createGrammarForJsonSchema };
  const model: InferenceDependencies["model"] = {
    createContext: vi.fn(async () => context),
    tokenize: vi.fn(() => [1, 2, 3]),
  };

  return { context, createGrammarForJsonSchema, grammar, llama, model };
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
    const { context, createGrammarForJsonSchema, grammar, llama, model } = createDependencies();

    const result = await extractRecipeHeaders({ llama, model, recipe: "recipe source" });

    expect(result.headers).toEqual(["Cake", "Bake"]);
    expect(result.response).toEqual({
      analysis: "Recipe sections identified.",
      ingredientHeaders: ["Cake"],
      directionHeaders: ["Bake"],
    });
    expect(result.output).toBe(output);
    expect(result.requestTokens).toBe(3);
    expect(createGrammarForJsonSchema).toHaveBeenCalledWith(expect.objectContaining({
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
