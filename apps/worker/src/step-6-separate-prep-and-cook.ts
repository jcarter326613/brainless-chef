import { LlamaChatSession, type LlamaGrammar } from "node-llama-cpp";

import type { AtomicDirection, ClassifiedDirection, DirectionPhase, InferenceDependencies } from "./types.js";

const instructions = `
Determine whether the supplied atomic recipe direction mixes only dry ingredients.

- Return dryMixing true only when every input is dry, such as flour, sugar, salt, spices, baking powder, baking soda, or a dry mixture.
- Return dryMixing false when an input is wet or fatty, such as butter, oil, eggs, milk, cream, water, fruit, or sauce.
- Return dryMixing false when the inputs are unspecified or their dryness is unclear.
- Do not infer ingredients or actions that are not in the direction.
`;

const responseSchema = {
  type: "object",
  properties: {
    dryMixing: { type: "boolean" },
  },
  required: ["dryMixing"],
  additionalProperties: false,
};

interface DryMixingResponse {
  dryMixing: boolean;
}

const knifeWorkPattern = /\b(?:chop|cut|dice|grate|mince|peel|slice|trim|zest)\b/i;
const mixingPattern = /\b(?:beat|combine|mix|stir|whisk|wisk)\b/i;

export interface DirectionClassificationOutput {
  direction: ClassifiedDirection;
  durationMs: number;
  output: string;
  requestTokens: number;
}

export interface DirectionClassificationResult {
  cookDirections: ClassifiedDirection[];
  directions: ClassifiedDirection[];
  durationMs: number;
  outputs: DirectionClassificationOutput[];
  prepDirections: ClassifiedDirection[];
  requestTokens: number;
}

const deterministicClassification = (phase: DirectionPhase): Omit<DirectionClassificationOutput, "direction"> & { phase: DirectionPhase } => ({
  durationMs: 0,
  output: JSON.stringify({ phase }),
  phase,
  requestTokens: 0,
});

async function classifyDryMixing({
  direction,
  grammar,
  llama,
  model,
}: InferenceDependencies & { direction: AtomicDirection; grammar: LlamaGrammar }): Promise<Omit<DirectionClassificationOutput, "direction"> & { phase: DirectionPhase }> {
  const context = await model.createContext({ contextSize: 16_384 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence() as never, systemPrompt: instructions });
  const input = JSON.stringify({ direction: direction.direction });
  const requestTokens = model.tokenize(`${instructions}\n${input}`).length;
  const startedAt = performance.now();

  try {
    const output = await session.prompt(input, { grammar, maxTokens: 128, temperature: 0 });
    const response = JSON.parse(output) as DryMixingResponse;

    return {
      durationMs: Math.round(performance.now() - startedAt),
      output,
      phase: response.dryMixing ? "prep" : "cook",
      requestTokens,
    };
  } finally {
    await context.dispose();
  }
}

async function classifyDirection({
  direction,
  grammar,
  llama,
  model,
}: InferenceDependencies & { direction: AtomicDirection; grammar: LlamaGrammar | undefined }): Promise<Omit<DirectionClassificationOutput, "direction"> & { phase: DirectionPhase }> {
  if (knifeWorkPattern.test(direction.direction)) return deterministicClassification("prep");
  if (!mixingPattern.test(direction.direction)) return deterministicClassification("cook");
  if (grammar === undefined) throw new Error("A dry-mixing grammar is required for mixing directions.");

  return classifyDryMixing({ direction, grammar, llama, model });
}

export async function separatePrepAndCook({
  directions,
  llama,
  model,
}: InferenceDependencies & { directions: AtomicDirection[] }): Promise<DirectionClassificationResult> {
  const startedAt = performance.now();
  const classifiedDirections: ClassifiedDirection[] = [];
  const outputs: DirectionClassificationOutput[] = [];
  let grammar: LlamaGrammar | undefined;

  for (const direction of directions) {
    if (mixingPattern.test(direction.direction) && grammar === undefined) {
      grammar = await llama.createGrammarForJsonSchema(responseSchema as never);
    }
    const result = await classifyDirection({ direction, grammar, llama, model });
    const classifiedDirection = { ...direction, phase: result.phase };

    classifiedDirections.push(classifiedDirection);
    outputs.push({ direction: classifiedDirection, ...result });
  }

  return {
    cookDirections: classifiedDirections.filter((direction) => direction.phase === "cook"),
    directions: classifiedDirections,
    durationMs: Math.round(performance.now() - startedAt),
    outputs,
    prepDirections: classifiedDirections.filter((direction) => direction.phase === "prep"),
    requestTokens: outputs.reduce((total, output) => total + output.requestTokens, 0),
  };
}
