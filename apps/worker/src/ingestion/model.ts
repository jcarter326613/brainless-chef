import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { z } from "zod";

import type { EvaluationTraceEvent } from "../evaluation-trace.js";

const CONTEXT_TOKENS = 16_384;
const REQUEST_OVERHEAD_TOKENS = 512;

function createGrammarSchema(schema: z.ZodType) {
  const removeRepetitionConstraints = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(removeRepetitionConstraints);
    if (value === null || typeof value !== "object") return value;

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !["minItems", "maxItems", "minLength", "maxLength"].includes(key))
        .map(([key, child]) => [key, removeRepetitionConstraints(child)]),
    );
  };

  return removeRepetitionConstraints(z.toJSONSchema(schema));
}

export interface StructuredModel {
  generate<Schema extends z.ZodType>(options: {
    input: string;
    maxOutputTokens: number;
    schema: Schema;
    stage: "facts" | "catalog-resolution" | "graph-plan" | "graph-repair";
    systemPrompt: string;
  }): Promise<z.output<Schema>>;
  dispose(): Promise<void>;
}

const serializeError = (error: unknown) => {
  if (error instanceof z.ZodError) return { issues: error.issues, message: error.message, name: error.name };
  if (error instanceof Error) return { message: error.message, name: error.name, stack: error.stack };
  return { message: String(error) };
};

export async function createStructuredModel(
  modelPath: string,
  { onTrace }: { onTrace?: (event: EvaluationTraceEvent) => void } = {},
): Promise<StructuredModel> {
  const llama = await getLlama({ build: "never", gpu: false, skipDownload: true });
  const model = await llama.loadModel({ modelPath });

  return {
    async generate({ input, maxOutputTokens, schema, stage, systemPrompt }) {
      const requestTokens = model.tokenize(`${systemPrompt}\n${input}`).length;
      if (requestTokens + maxOutputTokens + REQUEST_OVERHEAD_TOKENS > CONTEXT_TOKENS) {
        throw new Error("Recipe ingestion stage exceeds the model context budget.");
      }

      const grammarSchema = createGrammarSchema(schema);
      onTrace?.({
        data: { expectedSchema: z.toJSONSchema(schema), input, maxOutputTokens, requestTokens, systemPrompt },
        kind: "model-started",
        stage,
      });

      const startedAt = performance.now();
      let output: string | undefined;
      try {
        const grammar = await llama.createGrammarForJsonSchema(grammarSchema as never);
        const context = await model.createContext({ contextSize: CONTEXT_TOKENS });
        try {
          const session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt,
          });
          output = await session.prompt(input, { grammar, maxTokens: maxOutputTokens, temperature: 0 });
          const parsed = schema.parse(JSON.parse(output));

          onTrace?.({
            data: { parsed, rawOutput: output },
            elapsedMs: Math.round(performance.now() - startedAt),
            kind: "model-completed",
            stage,
          });
          return parsed;
        } finally {
          await context.dispose();
        }
      } catch (error) {
        onTrace?.({
          data: output === undefined ? undefined : { rawOutput: output },
          elapsedMs: Math.round(performance.now() - startedAt),
          error: serializeError(error),
          kind: "model-failed",
          stage,
        });
        if (error instanceof z.ZodError) {
          throw new Error(`The model returned an invalid structured result: ${error.message}`);
        }
        throw error;
      }
    },
    dispose: () => model.dispose(),
  };
}
