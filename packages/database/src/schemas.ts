import { z } from "zod";

const documentIdSchema = z.string().trim().min(1);
const nameSchema = z.string().trim().min(1);

export const inferenceJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const inferenceJobSchema = z
  .object({
    createdAtMs: z.number().int().nonnegative(),
    error: z.string().trim().min(1).max(1_000).optional(),
    finishedAtMs: z.number().int().nonnegative().optional(),
    input: z.string().trim().min(1).max(20_000),
    output: z.string().max(500_000),
    startedAtMs: z.number().int().nonnegative().optional(),
    status: inferenceJobStatusSchema,
    updatedAtMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.updatedAtMs < job.createdAtMs) {
      context.addIssue({
        code: "custom",
        message: "Updated time cannot precede created time.",
        path: ["updatedAtMs"],
      });
    }

    if (job.startedAtMs !== undefined && job.startedAtMs < job.createdAtMs) {
      context.addIssue({
        code: "custom",
        message: "Started time cannot precede created time.",
        path: ["startedAtMs"],
      });
    }

    if (job.startedAtMs !== undefined && job.updatedAtMs < job.startedAtMs) {
      context.addIssue({
        code: "custom",
        message: "Updated time cannot precede started time.",
        path: ["updatedAtMs"],
      });
    }

    if (job.finishedAtMs !== undefined && job.finishedAtMs < job.createdAtMs) {
      context.addIssue({
        code: "custom",
        message: "Finished time cannot precede created time.",
        path: ["finishedAtMs"],
      });
    }

    if (job.finishedAtMs !== undefined && job.updatedAtMs < job.finishedAtMs) {
      context.addIssue({
        code: "custom",
        message: "Updated time cannot precede finished time.",
        path: ["updatedAtMs"],
      });
    }

    if (
      job.startedAtMs !== undefined &&
      job.finishedAtMs !== undefined &&
      job.finishedAtMs < job.startedAtMs
    ) {
      context.addIssue({
        code: "custom",
        message: "Finished time cannot precede started time.",
        path: ["finishedAtMs"],
      });
    }

    const invalidState = (message: string, path: string) => {
      context.addIssue({ code: "custom", message, path: [path] });
    };

    if (job.status === "queued") {
      if (job.output !== "") invalidState("Queued jobs cannot have output.", "output");
      if (job.startedAtMs !== undefined)
        invalidState("Queued jobs cannot have a started time.", "startedAtMs");
      if (job.finishedAtMs !== undefined)
        invalidState("Queued jobs cannot have a finished time.", "finishedAtMs");
      if (job.error !== undefined) invalidState("Queued jobs cannot have an error.", "error");
    }

    if (job.status === "running") {
      if (job.output !== "") invalidState("Running jobs cannot have output.", "output");
      if (job.startedAtMs === undefined)
        invalidState("Running jobs require a started time.", "startedAtMs");
      if (job.finishedAtMs !== undefined)
        invalidState("Running jobs cannot have a finished time.", "finishedAtMs");
      if (job.error !== undefined) invalidState("Running jobs cannot have an error.", "error");
    }

    if (job.status === "succeeded") {
      if (job.output.trim() === "") invalidState("Succeeded jobs require output.", "output");
      if (job.startedAtMs === undefined)
        invalidState("Succeeded jobs require a started time.", "startedAtMs");
      if (job.finishedAtMs === undefined)
        invalidState("Succeeded jobs require a finished time.", "finishedAtMs");
      if (job.error !== undefined) invalidState("Succeeded jobs cannot have an error.", "error");
    }

    if (job.status === "failed") {
      if (job.output !== "") invalidState("Failed jobs cannot have output.", "output");
      if (job.finishedAtMs === undefined)
        invalidState("Failed jobs require a finished time.", "finishedAtMs");
      if (job.error === undefined) invalidState("Failed jobs require an error.", "error");
    }
  });

export const ingredientSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export const unitTypeSchema = z
  .object({
    name: nameSchema,
  })
  .strict();

export const recipeIngredientSchema = z
  .object({
    id: documentIdSchema,
    quantity: z
      .object({
        unitTypeId: documentIdSchema,
        value: z.number().finite().positive(),
      })
      .strict(),
  })
  .strict();

export const recipeInstructionSchema = z
  .object({
    ingredientIds: z.array(documentIdSchema).refine(
      (ingredientIds) => new Set(ingredientIds).size === ingredientIds.length,
      "Instruction ingredient IDs must be unique.",
    ),
    text: z.string().trim().min(1),
  })
  .strict();

export const recipeSchema = z
  .object({
    ingredients: z.array(recipeIngredientSchema).min(1),
    instructions: z.array(recipeInstructionSchema).min(1),
    title: z.string().trim().min(1),
  })
  .strict()
  .superRefine((recipe, context) => {
    const ingredientIds = new Set<string>();
    const referencedIngredientIds = new Set<string>();

    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      if (ingredientIds.has(ingredient.id)) {
        context.addIssue({
          code: "custom",
          message: "Recipe ingredient IDs must be unique.",
          path: ["ingredients", ingredientIndex, "id"],
        });
      }
      ingredientIds.add(ingredient.id);
    });

    recipe.instructions.forEach((instruction, instructionIndex) => {
      instruction.ingredientIds.forEach((ingredientId, ingredientIndex) => {
        if (!ingredientIds.has(ingredientId)) {
          context.addIssue({
            code: "custom",
            message: "Instruction references an ingredient not listed on the recipe.",
            path: ["instructions", instructionIndex, "ingredientIds", ingredientIndex],
          });
          return;
        }
        referencedIngredientIds.add(ingredientId);
      });
    });

    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      if (!referencedIngredientIds.has(ingredient.id)) {
        context.addIssue({
          code: "custom",
          message: "Every recipe ingredient must be used by an instruction.",
          path: ["ingredients", ingredientIndex, "id"],
        });
      }
    });
  });

export type Ingredient = z.infer<typeof ingredientSchema>;
export type InferenceJob = z.infer<typeof inferenceJobSchema>;
export type InferenceJobStatus = z.infer<typeof inferenceJobStatusSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeInstruction = z.infer<typeof recipeInstructionSchema>;
export type UnitType = z.infer<typeof unitTypeSchema>;
