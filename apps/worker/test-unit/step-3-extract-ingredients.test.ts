import { describe, expect, it, vi } from "vitest";

import type { LlamaGrammar } from "node-llama-cpp";

import type { InferenceDependencies, RecipeGroup } from "../src/types.js";

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

import { extractIngredients } from "../src/step-3-extract-ingredients.js";

function createDependencies() {
  const contexts: Array<{ dispose: ReturnType<typeof vi.fn>; getSequence: ReturnType<typeof vi.fn> }> = [];
  const grammar = {} as LlamaGrammar;
  const createGrammarForJsonSchema = vi.fn(async (_schema: never) => grammar);
  const llama: InferenceDependencies["llama"] = { createGrammarForJsonSchema };
  const model: InferenceDependencies["model"] = {
    createContext: vi.fn(async () => {
      const context = { dispose: vi.fn(), getSequence: vi.fn(() => "sequence") };
      contexts.push(context);
      return context;
    }),
    tokenize: vi.fn(() => [1, 2, 3]),
  };

  return { contexts, createGrammarForJsonSchema, grammar, llama, model };
}

describe("extractIngredients", () => {
  it("extracts each ingredient independently and preserves English and metric source quantities", async () => {
    state.outputs = [
      JSON.stringify({
        name: "unsalted butter",
        notes: ["softened"],
        optional: false,
        quantity: { kind: "exact", packageSize: null, unit: "CUP", value: 0.5 },
      }),
      JSON.stringify({
        name: "cinnamon",
        notes: [],
        optional: false,
        quantity: { kind: "exact", packageSize: null, unit: "G", value: 15 },
      }),
    ];
    state.sessions = [];
    const { contexts, createGrammarForJsonSchema, grammar, llama, model } = createDependencies();

    const result = await extractIngredients({
      llama,
      model,
      groups: [
        {
          component: { name: "Cake", type: "noun" },
          ingredients: [
            "120g/ 1/2 cup unsalted butter, softened",
            "15g cinnamon",
          ],
          directions: null,
        },
        {
          component: { name: "Bake", type: "other" },
          ingredients: null,
          directions: [],
        },
      ] satisfies RecipeGroup[],
    });

    expect(result.ingredientGroups).toEqual([{
      component: { name: "Cake", type: "noun" },
      ingredients: [
        {
          name: "unsalted butter",
          notes: ["softened"],
          optional: false,
          quantity: { kind: "exact", packageSize: null, unit: "cup", value: 0.5 },
        },
        {
          name: "cinnamon",
          notes: [],
          optional: false,
          quantity: { kind: "exact", packageSize: null, unit: "g", value: 15 },
        },
      ],
    }]);
    expect(result.requestTokens).toBe(6);
    expect(createGrammarForJsonSchema).toHaveBeenCalledOnce();
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions[0].prompts).toEqual([{
      recipe: JSON.stringify({
        component: { name: "Cake", type: "noun" },
        ingredient: "120g/ 1/2 cup unsalted butter, softened",
      }),
      options: { grammar, maxTokens: 1_024, temperature: 0 },
    }]);
    expect(contexts.every((context) => context.dispose.mock.calls.length === 1)).toBe(true);
  });

  it("does not run inference for groups without ingredients", async () => {
    state.outputs = [];
    state.sessions = [];
    const { llama, model } = createDependencies();

    const result = await extractIngredients({
      llama,
      model,
      groups: [{ component: { name: "Bake", type: "other" }, ingredients: null, directions: [] }],
    });

    expect(result.ingredientGroups).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(model.createContext).not.toHaveBeenCalled();
  });
});
