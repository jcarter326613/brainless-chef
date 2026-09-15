import { describe, expect, it, vi } from "vitest";

import type { LlamaGrammar } from "node-llama-cpp";

import type { InferenceDependencies, RecipeGroup } from "../src/types.js";

interface PromptCall {
  input: string;
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

    async prompt(input: string, options: unknown): Promise<string> {
      this.prompts.push({ input, options });
      const output = state.outputs.shift();
      if (output === undefined) throw new Error("No mock output configured.");
      return output;
    }
  },
}) as never);

import { simplifyDirections } from "../src/step-4-simplify-directions.js";

function createDependencies() {
  const contexts: Array<{ dispose: ReturnType<typeof vi.fn>; getSequence: ReturnType<typeof vi.fn> }> = [];
  const grammar = {} as LlamaGrammar;
  const createGrammarForJsonSchema = vi.fn(async (_schema: never) => grammar);
  const llama: InferenceDependencies["llama"] = { createGrammarForJsonSchema };
  const model: InferenceDependencies["model"] = {
    createContext: vi.fn(async () => {
      const context = { dispose: vi.fn(async () => undefined), getSequence: vi.fn(() => "sequence") };
      contexts.push(context);
      return context;
    }),
    tokenize: vi.fn(() => [1, 2, 3]),
  };

  return { contexts, createGrammarForJsonSchema, grammar, llama, model };
}

describe("simplifyDirections", () => {
  it("splits each source direction into ordered atomic directions", async () => {
    state.outputs = [
      JSON.stringify({ directions: ["Chop the onion.", "Set the onion aside."] }),
      JSON.stringify({ directions: ["Preheat the oven to 350 F."] }),
    ];
    state.sessions = [];
    const { contexts, createGrammarForJsonSchema, grammar, llama, model } = createDependencies();

    const result = await simplifyDirections({
      llama,
      model,
      groups: [
        {
          component: { name: "Filling", type: "noun" },
          ingredients: null,
          directions: ["Finely chop the onion, then set it aside."],
        },
        {
          component: null,
          ingredients: null,
          directions: ["Preheat the oven to 350 F."],
        },
      ] satisfies RecipeGroup[],
    });

    expect(result.directions).toEqual([
      {
        component: { name: "Filling", type: "noun" },
        direction: "Chop the onion.",
        order: 0,
        source: "Finely chop the onion, then set it aside.",
      },
      {
        component: { name: "Filling", type: "noun" },
        direction: "Set the onion aside.",
        order: 1,
        source: "Finely chop the onion, then set it aside.",
      },
      {
        component: null,
        direction: "Preheat the oven to 350 F.",
        order: 2,
        source: "Preheat the oven to 350 F.",
      },
    ]);
    expect(result.requestTokens).toBe(6);
    expect(createGrammarForJsonSchema).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({ directions: expect.objectContaining({ minItems: 1, type: "array" }) }),
    }));
    expect(state.sessions[0].prompts).toEqual([{
      input: JSON.stringify({ component: { name: "Filling", type: "noun" }, direction: "Finely chop the onion, then set it aside." }),
      options: { grammar, maxTokens: 2_048, temperature: 0 },
    }]);
    expect(contexts.every((context) => context.dispose.mock.calls.length === 1)).toBe(true);
  });

  it("does not create a context when groups have no directions", async () => {
    state.outputs = [];
    state.sessions = [];
    const { llama, model } = createDependencies();

    const result = await simplifyDirections({
      llama,
      model,
      groups: [{ component: null, ingredients: ["1 onion"], directions: null }],
    });

    expect(result.directions).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(model.createContext).not.toHaveBeenCalled();
  });
});
