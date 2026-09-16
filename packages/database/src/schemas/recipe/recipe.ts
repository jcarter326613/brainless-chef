import { z } from "zod";

import { cookSchema } from "./cook.js";
import type { IngredientInput } from "./ingredient-input.js";
import { prepSchema } from "./prep.js";
import {
  type AllocationQuantity,
  type IngredientQuantity,
  ingredientQuantitySchema,
} from "./quantity.js";
import { ingredientDocumentIdSchema } from "./identifiers.js";
import { textSchema, unitSchema } from "./shared.js";
import { toolSchema } from "./tool.js";

export const recipeIngredientSchema = z
  .object({
    id: ingredientDocumentIdSchema,
    notes: z.array(textSchema),
    optional: z.boolean(),
    quantity: ingredientQuantitySchema.nullable(),
  })
  .strict();

const sourceSchema = z.discriminatedUnion("type", [
  z
    .object({
      author: textSchema.nullable(),
      title: textSchema.nullable(),
      type: z.literal("url"),
      url: z.url(),
    })
    .strict(),
  z
    .object({
      author: textSchema.nullable(),
      title: textSchema.nullable(),
      type: z.literal("pasted-text"),
    })
    .strict(),
]);

const yieldSchema = z
  .object({
    quantity: z.number().positive().nullable(),
    unit: unitSchema.nullable(),
  })
  .strict();

type IssuePath = Array<string | number>;

const addIssue = (
  context: z.RefinementCtx,
  message: string,
  path: IssuePath,
) => context.addIssue({ code: "custom", message, path });

const addDuplicateIdIssues = <Entry>(
  entries: readonly Entry[],
  id: (entry: Entry) => string,
  path: (index: number) => IssuePath,
  label: string,
  context: z.RefinementCtx,
) => {
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    if (seen.has(id(entry))) {
      addIssue(context, `${label} IDs must be unique.`, path(index));
    }
    seen.add(id(entry));
  });
};

const validateTaskGraph = (
  tasks: ReadonlyArray<{ dependencies: readonly string[]; id: string }>,
  section: "prep" | "cook",
  context: z.RefinementCtx,
) => {
  const taskIndexes = new Map(tasks.map((task, index) => [task.id, index]));

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string) => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      const taskIndex = taskIndexes.get(taskId);
      if (taskIndex !== undefined) {
        addIssue(context, `${section} task inputs must be acyclic.`, [section, "tasks", taskIndex]);
      }
      return;
    }

    const taskIndex = taskIndexes.get(taskId);
    if (taskIndex === undefined) return;

    visiting.add(taskId);
    tasks[taskIndex].dependencies.forEach(visit);
    visiting.delete(taskId);
    visited.add(taskId);
  };

  tasks.forEach((task) => visit(task.id));
};

const allocationMatchesTotal = (
  total: IngredientQuantity | null,
  allocations: Array<AllocationQuantity | null>,
) => {
  if (total === null) return allocations.every((allocation) => allocation === null);

  if (total.kind === "exact") {
    const exactAllocations = allocations.filter(
      (allocation): allocation is Extract<AllocationQuantity, { kind: "exact" }> =>
        allocation?.kind === "exact" && allocation.unit === total.unit,
    );
    if (exactAllocations.length !== allocations.length) {
      return false;
    }
    return Math.abs(
      exactAllocations.reduce((sum, allocation) => sum + allocation.value, 0) - total.value,
    ) < 1e-9;
  }

  if (total.kind === "range") {
    return (
      allocations.length === 1 &&
      allocations[0]?.kind === "range" &&
      allocations[0].min === total.min &&
      allocations[0].max === total.max &&
      allocations[0].unit === total.unit
    );
  }

  if (total.kind === "approximate") {
    return (
      allocations.length === 1 &&
      allocations[0]?.kind === "approximate" &&
      allocations[0].value === total.value &&
      allocations[0].unit === total.unit
    );
  }

  return allocations.length > 0 && allocations.every((allocation) => allocation?.kind === total.kind);
};

export const recipeSchema = z
  .object({
    cook: cookSchema,
    ingredients: z.array(recipeIngredientSchema).min(1),
    prep: prepSchema,
    schemaVersion: z.literal("1.1"),
    source: sourceSchema,
    title: textSchema,
    tools: z.array(toolSchema),
    yield: yieldSchema,
  })
  .strict()
  .superRefine((recipe, context) => {
    addDuplicateIdIssues(
      recipe.tools,
      (tool) => tool.id,
      (index) => ["tools", index, "id"],
      "Tool",
      context,
    );
    addDuplicateIdIssues(
      recipe.prep.tasks,
      (task) => task.id,
      (index) => ["prep", "tasks", index, "id"],
      "Prep task",
      context,
    );
    addDuplicateIdIssues(
      recipe.cook.tasks,
      (task) => task.id,
      (index) => ["cook", "tasks", index, "id"],
      "Cook task",
      context,
    );

    const ingredientIds = new Set(recipe.ingredients.map((ingredient) => ingredient.id));
    const prepTaskIds = new Set(recipe.prep.tasks.map((task) => task.id));
    const cookTaskIds = new Set(recipe.cook.tasks.map((task) => task.id));
    const toolIds = new Set(recipe.tools.map((tool) => tool.id));
    const prepTaskDependencies: Array<{ dependencies: string[]; id: string }> = recipe.prep.tasks.map((task) => ({
      dependencies: [],
      id: task.id,
    }));
    const cookTaskDependencies: Array<{ dependencies: string[]; id: string }> = recipe.cook.tasks.map((task) => ({
      dependencies: [],
      id: task.id,
    }));

    const validateTaskTools = (tasks: typeof recipe.prep.tasks | typeof recipe.cook.tasks, section: "prep" | "cook") => {
      tasks.forEach((task, taskIndex) => {
        task.tools.forEach((toolId, toolIndex) => {
          if (!toolIds.has(toolId)) {
            addIssue(context, "Referenced tool does not exist.", [section, "tasks", taskIndex, "tools", toolIndex]);
          }
        });
      });
    };

    validateTaskTools(recipe.prep.tasks, "prep");
    validateTaskTools(recipe.cook.tasks, "cook");

    const ingredientAllocations = new Map<string, Array<AllocationQuantity | null>>();
    const recordIngredientAllocation = (
      input: IngredientInput,
      section: "prep" | "cook",
      taskIndex: number,
      inputIndex: number,
    ) => {
      if (!ingredientIds.has(input.id)) {
        addIssue(context, `${section === "prep" ? "Prep" : "Cook"} task references an ingredient not listed on the recipe.`, [
          section,
          "tasks",
          taskIndex,
          "inputs",
          inputIndex,
          "id",
        ]);
        return;
      }

      const allocations = ingredientAllocations.get(input.id) ?? [];
      allocations.push(input.quantity);
      ingredientAllocations.set(input.id, allocations);
    };

    recipe.prep.tasks.forEach((task, taskIndex) => {
      task.inputs.forEach((input, inputIndex) => {
        if (input.type === "ingredient") {
          recordIngredientAllocation(input, "prep", taskIndex, inputIndex);
          return;
        }

        if (!prepTaskIds.has(input.id)) {
          addIssue(context, "Prep task references an unknown prep task.", [
            "prep",
            "tasks",
            taskIndex,
            "inputs",
            inputIndex,
            "id",
          ]);
          return;
        }
        prepTaskDependencies[taskIndex].dependencies.push(input.id);
      });
    });

    validateTaskGraph(prepTaskDependencies, "prep", context);

    recipe.cook.tasks.forEach((task, taskIndex) => {
      task.inputs.forEach((input, inputIndex) => {
        if (input.type === "ingredient") {
          recordIngredientAllocation(input, "cook", taskIndex, inputIndex);
          return;
        }
        if (input.type === "prepTask") {
          if (!prepTaskIds.has(input.id)) {
            addIssue(context, "Cook task references an unknown prep task.", [
              "cook",
              "tasks",
              taskIndex,
              "inputs",
              inputIndex,
              "id",
            ]);
          }
          return;
        }

        if (!cookTaskIds.has(input.id)) {
          addIssue(context, "Cook task references an unknown cook task.", [
            "cook",
            "tasks",
            taskIndex,
            "inputs",
            inputIndex,
            "id",
          ]);
          return;
        }
        cookTaskDependencies[taskIndex].dependencies.push(input.id);
      });
    });

    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      const allocations = ingredientAllocations.get(ingredient.id) ?? [];
      if (allocations.length === 0) {
        addIssue(context, "Every recipe ingredient must be used by a prep or cook task.", [
          "ingredients",
          ingredientIndex,
          "id",
        ]);
        return;
      }
      if (!allocationMatchesTotal(ingredient.quantity, allocations)) {
        addIssue(context, "Ingredient allocations must reconcile with the recipe total.", [
          "ingredients",
          ingredientIndex,
          "quantity",
        ]);
      }
    });

    validateTaskGraph(cookTaskDependencies, "cook", context);
  });

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
