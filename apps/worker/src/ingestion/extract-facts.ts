import { recipeFactsSchema, type RecipeFacts } from "./contracts.js";
import type { StructuredModel } from "./model.js";
import { recipeFactsPrompt } from "./prompts.js";

export async function extractRecipeFacts(model: StructuredModel, input: string): Promise<RecipeFacts> {
  return model.generate({
    input,
    maxOutputTokens: 2_048,
    schema: recipeFactsSchema,
    systemPrompt: recipeFactsPrompt,
  });
}
