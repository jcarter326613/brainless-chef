import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { text } from "node:stream/consumers";

import { ingredientSchema } from "@brainless-chef/database";

import { ingestRecipe, type IngestionStage } from "./ingestion/ingest-recipe.js";
import { createStructuredModel } from "./ingestion/model.js";
import type { CatalogIngredient } from "./ingestion/resolve-ingredients.js";

interface Options {
  catalogPath?: string;
  recipePath: string;
}

export function parseOptions(arguments_: string[]): Options {
  let catalogPath: string | undefined;
  let recipePath: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--catalog") {
      const path = arguments_[index + 1];
      if (!path || path.startsWith("-")) throw new Error("--catalog requires a JSON file path.");
      catalogPath = path;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}.`);
    if (recipePath) throw new Error("Specify one recipe file path or - for standard input.");
    recipePath = argument;
  }

  if (!recipePath) throw new Error("Usage: evaluate:recipe [--catalog catalog.json] <recipe.txt|->");
  if (catalogPath === undefined) return { recipePath };
  return { catalogPath, recipePath };
}

async function readRecipe(path: string) {
  return path === "-" ? text(process.stdin) : readFile(path, "utf8");
}

async function readCatalog(path: string | undefined): Promise<CatalogIngredient[]> {
  if (!path) return [];

  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("Catalog JSON must be an array.");

  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Catalog entry ${index + 1} must be an object.`);
    }
    const { data, id } = entry as { data?: unknown; id?: unknown };
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error(`Catalog entry ${index + 1} requires an ID.`);
    }
    return { data: ingredientSchema.parse(data), id };
  });
}

const serializeStage = (stage: IngestionStage, data: unknown, elapsedMs: number) => ({
  data:
    stage === "catalog-resolution" && typeof data === "object" && data !== null
      ? {
          ...data,
          ingredientIds: Object.fromEntries((data as { ingredientIds: Map<string, string> }).ingredientIds),
        }
      : data,
  elapsedMs,
});

const options = parseOptions(process.argv.slice(2));
const modelPath = process.env.MODEL_PATH;
if (!modelPath) throw new Error("MODEL_PATH must be configured for recipe evaluation.");

const [catalog, input] = await Promise.all([readCatalog(options.catalogPath), readRecipe(options.recipePath)]);
const stages: Partial<Record<IngestionStage, unknown>> = {};
const startedAt = performance.now();
const model = await createStructuredModel(modelPath);
try {
  const result = await ingestRecipe({
    catalog,
    input,
    model,
    observer: {
      onStage(stage, data, elapsedMs) {
        stages[stage] = serializeStage(stage, data, elapsedMs);
      },
    },
  });
  console.log(
    JSON.stringify(
      {
        elapsedMs: Math.round(performance.now() - startedAt),
        newIngredients: result.newIngredients,
        recipe: result.recipe,
        stages,
      },
      null,
      2,
    ),
  );
} finally {
  await model.dispose();
}
