export const recipeFactsPrompt = `Extract grounded recipe facts from pasted recipe text. Return only JSON matching the supplied schema.

Rules:
- Use only facts present in the source. Never invent quantities, tools, temperatures, durations, or source metadata.
- Ingredient keys are short stable labels such as ingredient-1. Use each ingredient only once and combine its total amount when the source divides it.
- Normalize quantity units to lowercase words. Use null for an amount the source does not state.
- Classify amounts as exact, range, approximate, to-taste, or as-needed. Exact quantities require packageSize, using null when no package size is stated.
- Split source directions into ordered, atomic imperative instructions. Preserve heat and temperature wording in the instruction text.
- title and author are null when absent. Do not fabricate a title.`;

export const catalogResolutionPrompt = `Resolve recipe ingredient names against catalog candidates. Return only JSON matching the supplied schema.

For every unresolved ingredient key, select a candidateId only when it identifies the same ingredient, not a substitute. Return null when no candidate is the same ingredient. Synonyms such as scallion and green onion may match; substitutes such as shallot and onion must not match. Do not return IDs that are not candidates.`;

export const graphPlanPrompt = `Plan a recipe's executable material flow. Return only JSON matching the supplied schema.

Rules:
- Prep tasks consume recipe ingredients or outputs of earlier prep tasks. Each prep task produces one prep object.
- Cook tasks consume prep objects or outputs of earlier cook tasks. They never consume raw ingredients.
- Every prep object must have exactly one later prep or cook consumer. Split or linearize material flow when necessary.
- Use ingredient allocation kind all for the whole declared amount. Use fraction only to divide an exact amount; do not perform arithmetic yourself.
- Add the minimum physical tools and containers needed to execute the plan, even when the source does not name them.
- Prefer the supplied action vocabulary when exact; use custom otherwise.
- Preserve heat, temperature, and subjective completion wording in instruction or completion. Do not invent missing duration values.
- A cook task may have no output for non-material actions such as preheating.
- Use temporary keys only. Do not generate database IDs or dependencies.`;
