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

import { groupRecipe } from "../src/step-2-group-recipe.js";

function createDependencies() {
  const context = { dispose: vi.fn(async () => undefined), getSequence: vi.fn(() => "sequence") };
  const grammar = {} as LlamaGrammar;
  const createGrammarForJsonSchema = vi.fn(async (_schema: never) => grammar);
  const llama: InferenceDependencies["llama"] = { createGrammarForJsonSchema };
  const model: InferenceDependencies["model"] = {
    createContext: vi.fn(async () => context),
    tokenize: vi.fn(() => [1, 2]),
  };

  return { context, createGrammarForJsonSchema, grammar, llama, model };
}

describe("groupRecipe", () => {
  it("uses inferred headers to constrain component names in the grammar", async () => {
    state.outputs = [JSON.stringify([{
      component: { name: "Cake", type: "noun" },
      ingredients: ["200g flour"],
      directions: null,
    }])];
    state.sessions = [];
    const { context, createGrammarForJsonSchema, grammar, llama, model } = createDependencies();

    const result = await groupRecipe({ llama, model, recipe: "recipe source", headers: ["Cake"] });

    expect(result.groups).toEqual([{
      component: { name: "Cake", type: "noun" },
      ingredients: ["200g flour"],
      directions: null,
    }]);
    const schema = createGrammarForJsonSchema.mock.calls[0][0] as {
      items: { properties: { component: unknown } };
    };
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
    const { createGrammarForJsonSchema, llama, model } = createDependencies();

    await groupRecipe({ llama, model, recipe: "recipe source", headers: [] });

    const schema = createGrammarForJsonSchema.mock.calls[0][0] as {
      items: { properties: { component: unknown } };
    };
    expect(schema.items.properties.component).toEqual({ type: "null" });
  });
});
