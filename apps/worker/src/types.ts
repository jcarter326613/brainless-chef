import type { IngredientQuantity } from "@brainless-chef/database/schemas";
import type { LlamaGrammar } from "node-llama-cpp";

export type ComponentType = "noun" | "optional noun" | "other";

export interface Component {
  name: string;
  type: ComponentType;
}

export interface RecipeGroup {
  component: Component | null;
  ingredients: string[] | null;
  directions: string[] | null;
}

export interface StructuredIngredient {
  name: string;
  notes: string[];
  optional: boolean;
  quantity: IngredientQuantity | null;
}

export interface AtomicDirection {
  component: Component | null;
  direction: string;
  order: number;
  source: string;
}

export type DirectionPhase = "prep" | "cook";

export interface ClassifiedDirection extends AtomicDirection {
  phase: DirectionPhase;
}

export interface InferenceDependencies {
  llama: {
    createGrammarForJsonSchema(schema: never): Promise<LlamaGrammar>;
  };
  model: {
    createContext(options: { contextSize: number }): Promise<{
      dispose(): Promise<void>;
      getSequence(): unknown;
    }>;
    tokenize(text: string): readonly unknown[];
  };
}
