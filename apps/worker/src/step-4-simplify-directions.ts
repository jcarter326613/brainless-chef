import { LlamaChatSession, type LlamaGrammar } from "node-llama-cpp";

import type { AtomicDirection, Component, InferenceDependencies, RecipeGroup } from "./types.js";

const instructions = `
Rewrite the supplied recipe direction as ordered, atomic cooking instructions.

- Return one or more complete imperative sentences in directions.
- Split every distinct action into its own direction, preserving the exact source order.
- Cover every actionable source operation exactly once. Do not omit, combine, duplicate, reorder, or invent actions.
- Use plain, concise wording. Remove advice, descriptions, reassurance, and other flowery language that does not change what the cook must do.
- Preserve all stated ingredients, amounts, temperatures, times, equipment, placement, conditions, and completion criteria when they affect the action.
- Keep conditional actions conditional. Do not turn an optional action into a required action.
- Do not create headings, ingredient lists, or explanations.
`;

const responseSchema = {
  type: "object",
  properties: {
    directions: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
    },
  },
  required: ["directions"],
  additionalProperties: false,
};

interface DirectionResponse {
  directions: string[];
}

export interface DirectionSimplificationOutput {
  component: Component | null;
  directions: AtomicDirection[];
  durationMs: number;
  output: string;
  requestTokens: number;
  source: string;
}

export interface DirectionSimplificationResult {
  directions: AtomicDirection[];
  durationMs: number;
  outputs: DirectionSimplificationOutput[];
  requestTokens: number;
}

async function simplifyDirection({
  component,
  direction,
  grammar,
  llama,
  model,
}: InferenceDependencies & { component: Component | null; direction: string; grammar: LlamaGrammar }): Promise<Omit<DirectionSimplificationOutput, "component" | "directions" | "source"> & { directions: string[] }> {
  const context = await model.createContext({ contextSize: 16_384 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence() as never, systemPrompt: instructions });
  const input = JSON.stringify({ component, direction });
  const requestTokens = model.tokenize(`${instructions}\n${input}`).length;
  const startedAt = performance.now();

  try {
    const output = await session.prompt(input, { grammar, maxTokens: 2_048, temperature: 0 });
    const response = JSON.parse(output) as DirectionResponse;

    return {
      directions: response.directions,
      durationMs: Math.round(performance.now() - startedAt),
      output,
      requestTokens,
    };
  } finally {
    await context.dispose();
  }
}

export async function simplifyDirections({
  groups,
  llama,
  model,
}: InferenceDependencies & { groups: RecipeGroup[] }): Promise<DirectionSimplificationResult> {
  const grammar = await llama.createGrammarForJsonSchema(responseSchema as never);
  const startedAt = performance.now();
  const directions: AtomicDirection[] = [];
  const outputs: DirectionSimplificationOutput[] = [];

  for (const group of groups) {
    if (group.directions === null) continue;

    for (const source of group.directions) {
      const result = await simplifyDirection({
        component: group.component,
        direction: source,
        grammar,
        llama,
        model,
      });
      const atomicDirections = result.directions.map((direction, index) => ({
        component: group.component,
        direction,
        order: directions.length + index,
        source,
      }));

      directions.push(...atomicDirections);
      outputs.push({
        component: group.component,
        directions: atomicDirections,
        durationMs: result.durationMs,
        output: result.output,
        requestTokens: result.requestTokens,
        source,
      });
    }
  }

  return {
    directions,
    durationMs: Math.round(performance.now() - startedAt),
    outputs,
    requestTokens: outputs.reduce((total, output) => total + output.requestTokens, 0),
  };
}
