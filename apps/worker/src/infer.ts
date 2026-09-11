import { getLlama, LlamaChatSession } from "node-llama-cpp";

const recipeDraftJsonSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    ingredients: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          quantity: { type: "string" },
          unit: { type: "string" },
        },
        required: ["name", "quantity", "unit"],
      },
    },
    instructions: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
  },
  required: ["title", "ingredients", "instructions"],
} as const;

export async function inferRecipe(input: string, modelPath: string): Promise<string> {
  const llama = await getLlama({ build: "never", gpu: false, skipDownload: true });
  const model = await llama.loadModel({ modelPath });
  const inputTokens = model.tokenize(input);
  if (inputTokens.length > 6_500) {
    throw new Error("Recipe input exceeds the model token budget.");
  }

  const context = await model.createContext({ contextSize: 8_192 });
  const session = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt:
      "Extract the complete recipe from pasted text. Include at least one ingredient and every preparation action as a non-empty instruction in order. Put only the amount in quantity and the measurement name in unit. Return only JSON.",
  });
  const grammar = await llama.createGrammarForJsonSchema(recipeDraftJsonSchema);
  const output = await session.prompt(input, { grammar, maxTokens: 1_024 });

  grammar.parse(output);
  return output.trim();
}
