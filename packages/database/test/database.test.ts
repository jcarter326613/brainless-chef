import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestoreDatabase = vi.hoisted(() => ({
  createFirestoreDatabase: vi.fn(),
  defineCollection: vi.fn((definition) => definition),
}));

vi.mock("firestore-database", () => firestoreDatabase);

const loadDatabase = () => import("../src/database.js");

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  firestoreDatabase.defineCollection.mockImplementation((definition) => definition);
  vi.stubEnv("FIRESTORE_DATABASE_ID", "recipe-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database", () => {
  it("configures the recipe collections with the selected database", async () => {
    const configuredDatabase = {};
    firestoreDatabase.createFirestoreDatabase.mockReturnValue(configuredDatabase);

    const { database } = await loadDatabase();
    const { ingredientSchema, recipeSchema, unitTypeSchema } = await import(
      "../src/schemas.js",
    );

    const ingredients = {
      path: "ingredients",
      schema: ingredientSchema,
    };
    const recipes = {
      path: "recipes",
      schema: recipeSchema,
    };
    const unitTypes = {
      path: "unitTypes",
      schema: unitTypeSchema,
    };

    expect(database).toBe(configuredDatabase);
    expect(firestoreDatabase.defineCollection).toHaveBeenCalledTimes(3);
    expect(firestoreDatabase.defineCollection).toHaveBeenNthCalledWith(1, ingredients);
    expect(firestoreDatabase.defineCollection).toHaveBeenNthCalledWith(2, recipes);
    expect(firestoreDatabase.defineCollection).toHaveBeenNthCalledWith(3, unitTypes);
    expect(firestoreDatabase.createFirestoreDatabase).toHaveBeenCalledTimes(1);
    expect(firestoreDatabase.createFirestoreDatabase).toHaveBeenCalledWith({
      collections: {
        ingredients,
        recipes,
        unitTypes,
      },
      databaseId: "recipe-test",
    });
  });

  it("requires a Firestore database ID before configuring collections", async () => {
    vi.stubEnv("FIRESTORE_DATABASE_ID", "");

    await expect(loadDatabase()).rejects.toThrow(
      "FIRESTORE_DATABASE_ID must be configured for database access.",
    );
    expect(firestoreDatabase.defineCollection).not.toHaveBeenCalled();
    expect(firestoreDatabase.createFirestoreDatabase).not.toHaveBeenCalled();
  });
});
