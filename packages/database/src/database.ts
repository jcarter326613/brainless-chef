import {
  createFirestoreDatabase,
  defineCollection,
} from "firestore-database";

import {
  ingredientSchema,
  recipeSchema,
} from "./schemas/index.js";

const databaseId = process.env.FIRESTORE_DATABASE_ID;
if (!databaseId) {
  throw new Error("FIRESTORE_DATABASE_ID must be configured for database access.");
}

const collections = {
  ingredients: defineCollection({
    path: "ingredients",
    schema: ingredientSchema,
  }),
  recipes: defineCollection({
    path: "recipes",
    schema: recipeSchema,
  }),
};

export const database = createFirestoreDatabase({
  collections,
  databaseId,
});
