import { z } from "zod";

const documentIdSchema = z.string().trim().min(1);
const nameSchema = z.string().trim().min(1);

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
export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeInstruction = z.infer<typeof recipeInstructionSchema>;
export type UnitType = z.infer<typeof unitTypeSchema>;
