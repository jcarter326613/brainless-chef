import { describe, expect, it, vi } from "vitest";

import type { LlamaGrammar } from "node-llama-cpp";

import type { AtomicDirection, InferenceDependencies } from "../src/types.js";

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

import { separatePrepAndCook } from "../src/step-6-separate-prep-and-cook.js";

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
    tokenize: vi.fn(() => [1, 2]),
  };

  return { contexts, createGrammarForJsonSchema, grammar, llama, model };
}

describe("separatePrepAndCook", () => {
  it("partitions atomic directions while retaining their shared order", async () => {
    state.outputs = [JSON.stringify({ dryMixing: true })];
    state.sessions = [];
    const { contexts, createGrammarForJsonSchema, grammar, llama, model } = createDependencies();
    const directions = [
      { component: null, direction: "Chop the onion.", order: 0, source: "Chop the onion, then saute it." },
      { component: null, direction: "Whisk the flour, salt, and baking powder.", order: 1, source: "Whisk the dry ingredients." },
      { component: null, direction: "Saute the onion.", order: 2, source: "Chop the onion, then saute it." },
    ] satisfies AtomicDirection[];

    const result = await separatePrepAndCook({ directions, llama, model });

    expect(result.directions.map((direction) => [direction.order, direction.phase])).toEqual([
      [0, "prep"],
      [1, "prep"],
      [2, "cook"],
    ]);
    expect(result.prepDirections.map((direction) => direction.order)).toEqual([0, 1]);
    expect(result.cookDirections.map((direction) => direction.order)).toEqual([2]);
    expect(result.requestTokens).toBe(2);
    expect(createGrammarForJsonSchema).toHaveBeenCalledWith(expect.objectContaining({
      properties: expect.objectContaining({ dryMixing: { type: "boolean" } }),
    }));
    expect(state.sessions[0].prompts).toEqual([{
      input: JSON.stringify({ direction: "Whisk the flour, salt, and baking powder." }),
      options: { grammar, maxTokens: 128, temperature: 0 },
    }]);
    expect(contexts.every((context) => context.dispose.mock.calls.length === 1)).toBe(true);
  });

  it("routes reported setup instructions to cook without model inference", async () => {
    state.outputs = [JSON.stringify({ dryMixing: true })];
    state.sessions = [];
    const { createGrammarForJsonSchema, llama, model } = createDependencies();
    const result = await separatePrepAndCook({
      llama,
      model,
      directions: [
        { component: null, direction: "Line the pan with baking paper, leaving overhang.", order: 1, source: "Line the pan." },
        { component: null, direction: "Put all the Crumb ingredients into a bowl.", order: 3, source: "Put ingredients in a bowl." },
        { component: null, direction: "Place the crumb mixture in the fridge until required.", order: 6, source: "Place in the fridge." },
        { component: null, direction: "Wisk the flour in a medium bowl.", order: 7, source: "Whisk the flour." },
        { component: null, direction: "Put the butter and sugar in a separate bowl.", order: 11, source: "Put butter and sugar in a bowl." },
        { component: null, direction: "Put glaze ingredients in bowl.", order: 32, source: "Put glaze ingredients in a bowl." },
      ] satisfies AtomicDirection[],
    });

    expect(result.prepDirections.map((direction) => direction.order)).toEqual([7]);
    expect(result.cookDirections.map((direction) => direction.order)).toEqual([1, 3, 6, 11, 32]);
    expect(createGrammarForJsonSchema).toHaveBeenCalledOnce();
    expect(state.sessions).toHaveLength(1);
  });

  it("does not create a context for an empty direction list", async () => {
    state.outputs = [];
    state.sessions = [];
    const { createGrammarForJsonSchema, llama, model } = createDependencies();

    const result = await separatePrepAndCook({ directions: [], llama, model });

    expect(result.directions).toEqual([]);
    expect(result.prepDirections).toEqual([]);
    expect(result.cookDirections).toEqual([]);
    expect(createGrammarForJsonSchema).not.toHaveBeenCalled();
    expect(model.createContext).not.toHaveBeenCalled();
  });
});
