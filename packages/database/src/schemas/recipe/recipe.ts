import { z } from "zod";

import { cookSchema } from "./cook.js";
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
    schemaVersion: z.literal("1.0"),
    source: sourceSchema,
    title: textSchema,
    tools: z.array(toolSchema),
    yield: yieldSchema,
  })
  .strict()
  .superRefine((recipe, context) => {
    addDuplicateIdIssues(
      recipe.ingredients,
      (ingredient) => ingredient.id,
      (index) => ["ingredients", index, "id"],
      "Recipe ingredient",
      context,
    );
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
    const toolIds = new Set(recipe.tools.map((tool) => tool.id));
    const prepObjectProducers = new Map<string, { taskId: string; taskIndex: number }>();
    const prepObjectDependencies: Array<{ dependencies: string[]; id: string }> = recipe.prep.tasks.map((task) => ({
      dependencies: [],
      id: task.id,
    }));

    recipe.prep.tasks.forEach((task, taskIndex) => {
      if (prepObjectProducers.has(task.output.id)) {
        addIssue(context, "Prep output IDs must be unique.", ["prep", "tasks", taskIndex, "output", "id"]);
      }
      prepObjectProducers.set(task.output.id, { taskId: task.id, taskIndex });
      if (task.output.locationToolId !== null && !toolIds.has(task.output.locationToolId)) {
        addIssue(context, "Prep output location tool does not exist.", [
          "prep",
          "tasks",
          taskIndex,
          "output",
          "locationToolId",
        ]);
      }
    });

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

    const prepObjectUseCounts = new Map<string, number>();
    const ingredientAllocations = new Map<string, Array<AllocationQuantity | null>>();

    recipe.prep.tasks.forEach((task, taskIndex) => {
      task.inputs.forEach((input, inputIndex) => {
        if (input.type === "ingredient") {
          if (!ingredientIds.has(input.id)) {
            addIssue(context, "Prep task references an ingredient not listed on the recipe.", [
              "prep",
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
          return;
        }

        const producer = prepObjectProducers.get(input.id);
        if (!producer) {
          addIssue(context, "Prep task references an unknown prep object.", [
            "prep",
            "tasks",
            taskIndex,
            "inputs",
            inputIndex,
            "id",
          ]);
          return;
        }
        prepObjectDependencies[taskIndex].dependencies.push(producer.taskId);
        prepObjectUseCounts.set(input.id, (prepObjectUseCounts.get(input.id) ?? 0) + 1);
      });
    });

    validateTaskGraph(prepObjectDependencies, "prep", context);

    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      const allocations = ingredientAllocations.get(ingredient.id) ?? [];
      if (allocations.length === 0) {
        addIssue(context, "Every recipe ingredient must be used by a prep task.", [
          "ingredients",
          ingredientIndex,
          "id",
        ]);
        return;
      }
      if (!allocationMatchesTotal(ingredient.quantity, allocations)) {
        addIssue(context, "Prep ingredient allocations must reconcile with the recipe total.", [
          "ingredients",
          ingredientIndex,
          "quantity",
        ]);
      }
    });

    const cookOutputProducers = new Map<string, { taskId: string; taskIndex: number }>();
    const cookOutputDependencies: Array<{ dependencies: string[]; id: string }> = recipe.cook.tasks.map((task) => ({
      dependencies: [],
      id: task.id,
    }));
    recipe.cook.tasks.forEach((task, taskIndex) => {
      if (!task.output) return;
      if (cookOutputProducers.has(task.output.id)) {
        addIssue(context, "Cook output IDs must be unique.", ["cook", "tasks", taskIndex, "output", "id"]);
      }
      cookOutputProducers.set(task.output.id, { taskId: task.id, taskIndex });
      if (task.output.locationToolId !== null && !toolIds.has(task.output.locationToolId)) {
        addIssue(context, "Cook output location tool does not exist.", [
          "cook",
          "tasks",
          taskIndex,
          "output",
          "locationToolId",
        ]);
      }
    });

    recipe.cook.tasks.forEach((task, taskIndex) => {
      task.inputs.forEach((input, inputIndex) => {
        if (input.type === "prepObject") {
          if (!prepObjectProducers.has(input.id)) {
            addIssue(context, "Cook task references an unknown prep object.", [
              "cook",
              "tasks",
              taskIndex,
              "inputs",
              inputIndex,
              "id",
            ]);
            return;
          }
          prepObjectUseCounts.set(input.id, (prepObjectUseCounts.get(input.id) ?? 0) + 1);
          return;
        }

        const producer = cookOutputProducers.get(input.id);
        if (!producer) {
          addIssue(context, "Cook task references an unknown cook output.", [
            "cook",
            "tasks",
            taskIndex,
            "inputs",
            inputIndex,
            "id",
          ]);
          return;
        }
        cookOutputDependencies[taskIndex].dependencies.push(producer.taskId);
      });
    });

    validateTaskGraph(cookOutputDependencies, "cook", context);

    prepObjectProducers.forEach((producer, prepObjectId) => {
      if (prepObjectUseCounts.get(prepObjectId) !== 1) {
        addIssue(context, "Every prep object must be consumed exactly once.", [
          "prep",
          "tasks",
          producer.taskIndex,
          "output",
          "id",
        ]);
      }
    });

    if (recipe.cook.finalOutputId !== null && !cookOutputProducers.has(recipe.cook.finalOutputId)) {
      addIssue(context, "Final cook output does not exist.", ["cook", "finalOutputId"]);
    }
  });

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
