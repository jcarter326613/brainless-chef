import {
  cookActionTypeSchema,
  prepActionTypeSchema,
  recipeSchema,
  type IngredientQuantity,
  type Recipe,
} from "@brainless-chef/database";

import type { GraphPlan, RecipeFacts } from "./contracts.js";

const assertUniqueKeys = (label: string, keys: readonly string[]) => {
  if (new Set(keys).size !== keys.length) throw new Error(`${label} keys must be unique.`);
};

const resolveAction = (
  action: string,
  schema: typeof prepActionTypeSchema | typeof cookActionTypeSchema,
) => {
  const parsed = schema.safeParse(action.trim().toLowerCase());
  return parsed.success ? parsed.data : "custom";
};

const allocationFor = (
  quantity: IngredientQuantity | null,
  allocation: { kind: "all" } | { denominator: number; kind: "fraction"; numerator: number },
) => {
  if (allocation.kind === "fraction") {
    if (quantity?.kind !== "exact") {
      throw new Error("Only exact ingredient quantities can be divided by a fraction.");
    }
    return {
      kind: "exact" as const,
      unit: quantity.unit,
      value: (quantity.value * allocation.numerator) / allocation.denominator,
    };
  }

  if (quantity === null) return null;
  if (quantity.kind === "exact") return { kind: "exact" as const, unit: quantity.unit, value: quantity.value };
  return quantity;
};

export function compileRecipe({
  facts,
  ingredientIds,
  plan,
}: {
  facts: RecipeFacts;
  ingredientIds: ReadonlyMap<string, string>;
  plan: GraphPlan;
}): Recipe {
  assertUniqueKeys("Tool", plan.tools.map((tool) => tool.key));
  assertUniqueKeys("Prep task", plan.prepTasks.map((task) => task.key));
  assertUniqueKeys("Cook task", plan.cookTasks.map((task) => task.key));

  const toolIds = new Map(plan.tools.map((tool, index) => [tool.key, `tool-${index + 1}`]));
  const prepTaskIds = new Map(plan.prepTasks.map((task, index) => [task.key, `prep-task-${index + 1}`]));
  const prepObjectIds = new Map(plan.prepTasks.map((task, index) => [task.key, `prep-object-${index + 1}`]));
  const cookTaskIds = new Map(plan.cookTasks.map((task, index) => [task.key, `cook-task-${index + 1}`]));
  const cookOutputIds = new Map(
    plan.cookTasks.flatMap((task, index) => (task.output ? [[task.key, `cook-output-${index + 1}`] as const] : [])),
  );
  const toolId = (key: string | null) => {
    if (key === null) return null;
    const id = toolIds.get(key);
    if (!id) throw new Error(`Unknown tool key ${key}.`);
    return id;
  };

  const factByKey = new Map(facts.ingredients.map((ingredient) => [ingredient.key, ingredient]));
  const finalOutputId =
    plan.finalCookTaskKey === null ? null : cookOutputIds.get(plan.finalCookTaskKey);
  if (plan.finalCookTaskKey !== null && !finalOutputId) {
    throw new Error(`Cook task ${plan.finalCookTaskKey} does not produce the final output.`);
  }
  const recipe = {
    cook: {
      finalOutputId,
      tasks: plan.cookTasks.map((task) => ({
        action: { type: resolveAction(task.actionType, cookActionTypeSchema) },
        completion: task.completion,
        duration:
          task.duration === null
            ? null
            : {
                ...task.duration,
                timerRecommended:
                  task.duration.attention === "passive" || (task.duration.maxSeconds ?? 0) >= 60,
              },
        id: cookTaskIds.get(task.key)!,
        inputs: task.inputs.map((input) => {
          if (input.type === "prepObject") {
            const id = prepObjectIds.get(input.prepTaskKey);
            if (!id) throw new Error(`Unknown prep task key ${input.prepTaskKey}.`);
            return { id, type: "prepObject" as const };
          }
          const id = cookOutputIds.get(input.cookTaskKey);
          if (!id) throw new Error(`Unknown cook output key ${input.cookTaskKey}.`);
          return { id, type: "cookOutput" as const };
        }),
        instruction: task.instruction,
        output:
          task.output === null
            ? null
            : {
                id: cookOutputIds.get(task.key)!,
                label: task.output.label,
                locationToolId: toolId(task.output.locationToolKey),
              },
        tools: task.tools.map((key) => toolId(key)!),
      })),
    },
    ingredients: facts.ingredients.map((ingredient) => {
      const id = ingredientIds.get(ingredient.key);
      if (!id) throw new Error(`Missing catalog resolution for ${ingredient.key}.`);
      return { id, notes: ingredient.notes, optional: ingredient.optional, quantity: ingredient.quantity };
    }),
    prep: {
      tasks: plan.prepTasks.map((task) => ({
        action: { type: resolveAction(task.actionType, prepActionTypeSchema) },
        id: prepTaskIds.get(task.key)!,
        inputs: task.inputs.map((input) => {
          if (input.type === "prepObject") {
            const id = prepObjectIds.get(input.prepTaskKey);
            if (!id) throw new Error(`Unknown prep task key ${input.prepTaskKey}.`);
            return { id, type: "prepObject" as const };
          }
          const ingredient = factByKey.get(input.ingredientKey);
          const id = ingredientIds.get(input.ingredientKey);
          if (!ingredient || !id) throw new Error(`Unknown ingredient key ${input.ingredientKey}.`);
          return {
            id,
            quantity: allocationFor(ingredient.quantity, input.allocation),
            type: "ingredient" as const,
          };
        }),
        instruction: task.instruction,
        output: {
          id: prepObjectIds.get(task.key)!,
          label: task.output.label,
          locationToolId: toolId(task.output.locationToolKey),
        },
        tools: task.tools.map((key) => toolId(key)!),
      })),
    },
    schemaVersion: "1.0" as const,
    source: {
      author: facts.author,
      title: facts.title,
      type: "pasted-text" as const,
    },
    title: facts.title ?? "Untitled recipe",
    tools: plan.tools.map((tool) => ({
      id: toolIds.get(tool.key)!,
      label: tool.label,
      name: tool.name,
      size: tool.size,
      type: tool.type,
    })),
    yield: facts.yield,
  };

  return recipeSchema.parse(recipe);
}
