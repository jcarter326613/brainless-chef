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

import { createRelationships } from "../src/step-5-create-relationships.js";

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

describe("createRelationships", () => {
  it("carries grounded material context between ordered directions", async () => {
    state.outputs = [
      JSON.stringify({
        available: { label: "flour in the bowl", container: "medium bowl" },
        inputs: [{ candidateId: "ingredient:0", fullyConsumed: true, quantity: null }],
      }),
      JSON.stringify({
        available: { label: "cake batter", container: "medium bowl" },
        inputs: [{ candidateId: "direction:0", fullyConsumed: true, quantity: null }],
      }),
      JSON.stringify({
        available: null,
        inputs: [{ candidateId: "direction:1", fullyConsumed: true, quantity: null }],
      }),
    ];
    state.sessions = [];
    const { contexts, createGrammarForJsonSchema, grammar, llama, model } = createDependencies();
    const directions = [
      { component: { name: "Cake batter", type: "noun" }, direction: "Put the flour in a medium bowl.", order: 0, source: "Put flour in a bowl." },
      { component: { name: "Cake batter", type: "noun" }, direction: "Mix the contents of the bowl.", order: 1, source: "Mix the contents." },
      { component: { name: "Cake batter", type: "noun" }, direction: "Add the batter to the pan.", order: 2, source: "Add batter to pan." },
    ] satisfies AtomicDirection[];

    const result = await createRelationships({
      directions,
      ingredientGroups: [
        {
          component: { name: "Cake", type: "noun" },
          ingredients: [
            { name: "flour", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "cup", value: 2 } },
          ],
        },
        {
          component: { name: "Crumb", type: "noun" },
          ingredients: [
            { name: "flour", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "cup", value: 0.5 } },
          ],
        },
      ],
      llama,
      model,
    });

    expect(result.relationships).toEqual([
      {
        available: { label: "flour in the bowl", container: "medium bowl" },
        direction: directions[0],
        inputs: [{ ingredientIndex: 0, quantity: { kind: "exact", unit: "cup", value: 2 }, type: "ingredient" }],
      },
      {
        available: { label: "cake batter", container: "medium bowl" },
        direction: directions[1],
        inputs: [{ directionOrder: 0, quantity: { kind: "exact", unit: "whole", value: 1 }, type: "direction" }],
      },
      {
        available: null,
        direction: directions[2],
        inputs: [{ directionOrder: 1, quantity: { kind: "exact", unit: "whole", value: 1 }, type: "direction" }],
      },
    ]);
    expect(result.requestTokens).toBe(6);
    expect(createGrammarForJsonSchema).toHaveBeenCalledTimes(3);
    const firstSchema = createGrammarForJsonSchema.mock.calls[0][0] as {
      properties: { inputs: { items: { properties: { candidateId: { enum: string[] } } } } };
    };
    expect(firstSchema.properties.inputs.items.properties.candidateId.enum).toEqual(["ingredient:0"]);
    const secondInput = JSON.parse(state.sessions[1].prompts[0].input) as {
      candidates: Array<{ container: string | null; id: string; label: string }>;
    };
    expect(secondInput.candidates).toEqual([
      { component: "cake batter", container: "medium bowl", id: "direction:0", label: "flour in the bowl", quantity: { kind: "exact", unit: "whole", value: 1 }, remainingWhole: 1, type: "direction" },
    ]);
    expect(state.sessions[0].prompts[0].options).toEqual({ grammar, maxTokens: 1_024, temperature: 0 });
    expect(contexts.every((context) => context.dispose.mock.calls.length === 1)).toBe(true);
  });

  it("matches plural and optional direction categories to ingredient categories", async () => {
    state.outputs = [
      JSON.stringify({ available: null, inputs: [{ candidateId: "ingredient:1", fullyConsumed: true, quantity: null }] }),
      JSON.stringify({ available: null, inputs: [{ candidateId: "ingredient:2", fullyConsumed: true, quantity: null }] }),
    ];
    state.sessions = [];
    const { llama, model } = createDependencies();

    const result = await createRelationships({
      directions: [
        { component: { name: "Crumbs", type: "noun" }, direction: "Use the brown sugar.", order: 0, source: "Use brown sugar." },
        { component: { name: "Glaze", type: "noun" }, direction: "Use the milk.", order: 1, source: "Use milk." },
      ] satisfies AtomicDirection[],
      ingredientGroups: [
        { component: { name: "Cake", type: "noun" }, ingredients: [{ name: "flour", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "cup", value: 2 } }] },
        { component: { name: "Crumb", type: "noun" }, ingredients: [{ name: "brown sugar", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "cup", value: 0.5 } }] },
        { component: { name: "Optional glaze", type: "optional noun" }, ingredients: [{ name: "milk", notes: [], optional: true, quantity: { kind: "exact", packageSize: null, unit: "tsp", value: 4 } }] },
      ],
      llama,
      model,
    });

    expect(result.outputs[0].candidates.map((candidate) => candidate.id)).toEqual(["ingredient:1"]);
    expect(result.outputs[1].candidates.map((candidate) => candidate.id)).toEqual(["ingredient:2"]);
  });

  it("retains partially consumed candidates", async () => {
    state.outputs = [
      JSON.stringify({
        available: { label: "some flour", container: null },
        inputs: [{ candidateId: "ingredient:0", fullyConsumed: false, quantity: { kind: "exact", unit: "whole", value: 0.33 } }],
      }),
      JSON.stringify({ available: null, inputs: [] }),
    ];
    state.sessions = [];
    const { llama, model } = createDependencies();

    const result = await createRelationships({
      directions: [
        { component: null, direction: "Use one third of the flour.", order: 0, source: "Use one third of the flour." },
        { component: null, direction: "Set the bowl aside.", order: 1, source: "Set it aside." },
      ],
      ingredientGroups: [{ component: null, ingredients: [{ name: "flour", notes: [], optional: false, quantity: { kind: "exact", packageSize: null, unit: "cup", value: 3 } }] }],
      llama,
      model,
    });

    expect(result.relationships[0].inputs).toEqual([
      { ingredientIndex: 0, quantity: { kind: "exact", unit: "whole", value: 0.33 }, type: "ingredient" },
    ]);
    expect(result.outputs[1].candidates).toContainEqual(expect.objectContaining({
      id: "ingredient:0",
      remainingWhole: 0.67,
    }));
  });

  it("does not create grammars or contexts for no directions", async () => {
    state.outputs = [];
    state.sessions = [];
    const { createGrammarForJsonSchema, llama, model } = createDependencies();

    const result = await createRelationships({ directions: [], ingredientGroups: [], llama, model });

    expect(result.ingredients).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(createGrammarForJsonSchema).not.toHaveBeenCalled();
    expect(model.createContext).not.toHaveBeenCalled();
  });
});
