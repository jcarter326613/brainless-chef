import {
  createFirestoreDatabase,
  defineCollection,
} from "firestore-database";

import {
  inferenceJobSchema,
  ingredientSchema,
  recipeSchema,
  unitTypeSchema,
} from "./schemas.js";

const databaseId = process.env.FIRESTORE_DATABASE_ID;
if (!databaseId) {
  throw new Error("FIRESTORE_DATABASE_ID must be configured for database access.");
}

const collections = {
  inferenceJobs: defineCollection({
    path: "inferenceJobs",
    schema: inferenceJobSchema,
  }),
  ingredients: defineCollection({
    path: "ingredients",
    schema: ingredientSchema,
  }),
  recipes: defineCollection({
    path: "recipes",
    schema: recipeSchema,
  }),
  unitTypes: defineCollection({
    path: "unitTypes",
    schema: unitTypeSchema,
  }),
};

export const database = createFirestoreDatabase({
  collections,
  databaseId,
});
