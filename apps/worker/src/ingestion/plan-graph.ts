import type { RecipeFacts } from "./contracts.js";
import { graphPlanSchema, type GraphPlan } from "./contracts.js";
import type { StructuredModel } from "./model.js";
import { graphPlanPrompt } from "./prompts.js";

export async function planRecipeGraph(model: StructuredModel, facts: RecipeFacts): Promise<GraphPlan> {
  return generatePlan(model, JSON.stringify(facts), graphPlanPrompt);
}

export async function repairRecipeGraph(
  model: StructuredModel,
  facts: RecipeFacts,
  plan: GraphPlan,
  validationError: Error,
): Promise<GraphPlan> {
  return generatePlan(
    model,
    JSON.stringify({ facts, previousPlan: plan, validationError: validationError.message }),
    `${graphPlanPrompt}\n\nRepair the previous plan using the validation error. Keep valid semantics unchanged.`,
  );
}

async function generatePlan(
  model: StructuredModel,
  input: string,
  systemPrompt: string,
): Promise<GraphPlan> {
  return model.generate({
    input,
    maxOutputTokens: 4_096,
    schema: graphPlanSchema,
    systemPrompt,
  });
}
