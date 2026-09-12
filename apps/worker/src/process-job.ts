import type { Ingredient, InferenceJob, Recipe } from "@brainless-chef/database";

import type { CatalogIngredient } from "./ingestion/resolve-ingredients.js";

interface StoredDocument<Data> {
  data: Data;
  id: string;
}

interface InferenceJobCollection {
  get(id: string): Promise<StoredDocument<InferenceJob> | undefined>;
  update(id: string, updater: (current: InferenceJob) => InferenceJob): Promise<InferenceJob>;
}

interface IngredientCollection {
  get(id: string): Promise<StoredDocument<Ingredient> | undefined>;
  query(): Promise<Array<StoredDocument<Ingredient>>>;
  set(id: string, data: Ingredient): Promise<void>;
}

interface RecipeCollection {
  set(id: string, data: Recipe): Promise<void>;
}

interface IngestionDatabaseCollections {
  inferenceJobs: InferenceJobCollection;
  ingredients: IngredientCollection;
  recipes: RecipeCollection;
}

export interface InferenceDatabase {
  collections: IngestionDatabaseCollections;
  transaction<Result>(
    operation: (database: { collections: IngestionDatabaseCollections }) => Promise<Result>,
  ): Promise<Result>;
}

export interface ProcessJobDependencies {
  database: InferenceDatabase;
  ingest(input: string, catalog: readonly CatalogIngredient[]): Promise<{
    newIngredients: Array<{ data: Ingredient; id: string }>;
    recipe: Recipe;
  }>;
  logger?: Pick<Console, "error" | "info">;
  now?: () => number;
}

export async function processJob(
  jobId: string,
  { database, ingest, logger = console, now = Date.now }: ProcessJobDependencies,
): Promise<boolean> {
  const claimed = await database.transaction(async ({ collections }) => {
    const existing = await collections.inferenceJobs.get(jobId);
    if (!existing || existing.data.status !== "queued") return undefined;

    const startedAtMs = Math.max(now(), existing.data.createdAtMs);
    const data = await collections.inferenceJobs.update(jobId, (current) => {
      if (current.status !== "queued") {
        throw new Error(`Inference job ${jobId} was claimed by another execution.`);
      }

      return {
        ...current,
        startedAtMs,
        status: "running",
        updatedAtMs: startedAtMs,
      };
    });

    return { data, id: jobId };
  });

  if (!claimed) {
    logger.info(`Inference job ${jobId} is missing or no longer queued.`);
    return false;
  }

  try {
    const catalog = await database.collections.ingredients.query();
    const result = await ingest(claimed.data.input, catalog);
    const finishedAtMs = Math.max(now(), claimed.data.startedAtMs ?? claimed.data.createdAtMs);

    await database.transaction(async ({ collections }) => {
      const current = await collections.inferenceJobs.get(jobId);
      if (!current || current.data.status !== "running") {
        throw new Error(`Inference job ${jobId} is no longer running.`);
      }

      const newIngredients = new Map(result.newIngredients.map((ingredient) => [ingredient.id, ingredient.data]));
      for (const ingredientId of new Set(result.recipe.ingredients.map((ingredient) => ingredient.id))) {
        const existing = await collections.ingredients.get(ingredientId);
        if (existing) continue;

        const ingredient = newIngredients.get(ingredientId);
        if (!ingredient) {
          throw new Error(`Recipe references missing catalog ingredient ${ingredientId}.`);
        }
        await collections.ingredients.set(ingredientId, ingredient);
      }

      await collections.recipes.set(jobId, result.recipe);
      await collections.inferenceJobs.update(jobId, (job) => {
        if (job.status !== "running") {
          throw new Error(`Inference job ${jobId} is no longer running.`);
        }

        return {
          ...job,
          finishedAtMs,
          recipeId: jobId,
          status: "succeeded",
          updatedAtMs: finishedAtMs,
        };
      });
    });
    return true;
  } catch (error) {
    logger.error(`Inference job ${jobId} failed.`, error);
    const finishedAtMs = Math.max(now(), claimed.data.startedAtMs ?? claimed.data.createdAtMs);

    await database.collections.inferenceJobs.update(jobId, (current) => {
      if (current.status !== "running") return current;

      return {
        ...current,
        error: "Recipe ingestion failed.",
        finishedAtMs,
        status: "failed",
        updatedAtMs: finishedAtMs,
      };
    });

    throw error;
  }
}
