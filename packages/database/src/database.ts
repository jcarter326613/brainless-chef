import {
  createFirestoreDatabase,
  defineCollection,
} from "firestore-database";

import {
  ingredientSchema,
  loginTokenSchema,
  recipeSchema,
  userSchema,
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
  users: defineCollection({
    path: "users",
    schema: userSchema,
  }),
  loginTokens: defineCollection({
    path: "login-tokens",
    schema: loginTokenSchema,
  }),
};

export const database = createFirestoreDatabase({
  collections,
  databaseId,
});
