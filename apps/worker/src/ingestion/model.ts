import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { z } from "zod";

const CONTEXT_TOKENS = 16_384;
const REQUEST_OVERHEAD_TOKENS = 512;

export interface StructuredModel {
  generate<Schema extends z.ZodType>(options: {
    input: string;
    maxOutputTokens: number;
    schema: Schema;
    systemPrompt: string;
  }): Promise<z.output<Schema>>;
  dispose(): Promise<void>;
}

export async function createStructuredModel(modelPath: string): Promise<StructuredModel> {
  const llama = await getLlama({ build: "never", gpu: false, skipDownload: true });
  const model = await llama.loadModel({ modelPath });

  return {
    async generate({ input, maxOutputTokens, schema, systemPrompt }) {
      const requestTokens = model.tokenize(`${systemPrompt}\n${input}`).length;
      if (requestTokens + maxOutputTokens + REQUEST_OVERHEAD_TOKENS > CONTEXT_TOKENS) {
        throw new Error("Recipe ingestion stage exceeds the model context budget.");
      }

      const grammar = await llama.createGrammarForJsonSchema(z.toJSONSchema(schema) as never);
      const context = await model.createContext({ contextSize: CONTEXT_TOKENS });
      try {
        const session = new LlamaChatSession({
          contextSequence: context.getSequence(),
          systemPrompt,
        });
        const output = await session.prompt(input, { grammar, maxTokens: maxOutputTokens, temperature: 0 });

        grammar.parse(output);
        return schema.parse(JSON.parse(output));
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`The model returned an invalid structured result: ${error.message}`);
        }
        throw error;
      } finally {
        await context.dispose();
      }
    },
    dispose: () => model.dispose(),
  };
}
