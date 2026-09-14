import { LlamaChatSession } from "node-llama-cpp";

const createInstructions = () => `
Separate the supplied recipe into a collection of ingredients and directions.

- If the ingredients or directions are separated into different components or sections, include information about the name of the component in the output object or null otherwise. When including the name, also include whether the name is a noun, an optional noun or "other" such as a verb in the type field. Component names should not have extra punctuation such as colons.
- Set component.type from the entire component name: use "noun" for a noun phrase, "optional noun" for an optional noun phrase, and "other" for an action or verb phrase.
- Component names should not be repeated as an ingredient or direction unless they appear separately.
- "Ingredients", "Directions", "Instructions", or synomyms to those, do not indicate named components.
- Every other named heading must be represented as the component of its own top-level object. Do not merge the content of distinct named sections.
- We do want to have the ingredients section and directions sections in separate components in the output JSON. If we are in the ingredients section, each ingredient should be supplied as a separate string in an array of ingredient strings. Similarly, each complete direction sentence or sentences should be given in the direction array as its own string.
- Keep the same order of the ingredients and directions as how they appeared in the recipe.
- Don't de-duplicate repeated ingredients.
- Strings may be split only at sentence boundaries, while their text and punctuation must otherwise remain unchanged.
- Line numbering or bulleting should be stripped.
- Component names may start with a number such as "4. Sauce" but since we are discarding line numbers, the "4." doesn't count and in this scenario, "Sauce" would be a component.
- The directions should have only one sentence per array string except in the case of fragment sentences which should be combined into the same string when they are adjacent and related.
- Each top level object in the returned structure should correspond to a single component that can be found in the ingredients or directions sections. Ingredients and directions should not both be present in the same object.
- Return top-level output objects covering all source content. Every ingredient entry and direction sentence must appear exactly once. An empty collection or omitted source section is incorrect.
- For example, a named ingredient section is represented as {"component":{"name":"Sauce","type":"noun"},"ingredients":["ingredient text"],"directions":null}. A named direction section is represented as {"component":{"name":"Sauce","type":"noun"},"ingredients":null,"directions":["direction sentence"]}.
`;

const createResponseSchema = (headerNames) => {
  const namedComponent = {
    type: "object",
    properties: {
      name: { enum: headerNames },
      type: { enum: ["noun", "optional noun", "other"] },
    },
    required: ["name", "type"],
    additionalProperties: false,
  };
  const component = headerNames.length === 0
    ? { type: "null" }
    : { oneOf: [namedComponent, { type: "null" }] };

  return {
    type: "array",
    items: {
      type: "object",
      properties: {
        component,
        ingredients: {
          oneOf: [
            {
              type: "array",
              items: { type: "string" },
            },
            { type: "null" },
          ],
        },
        directions: {
          oneOf: [
            {
              type: "array",
              items: { type: "string" },
            },
            { type: "null" },
          ],
        },
      },
      required: ["component", "ingredients", "directions"],
      additionalProperties: false,
    },
  };
};

export async function groupRecipe({ llama, model, recipe, headers }) {
  const instructions = createInstructions();
  const context = await model.createContext({ contextSize: 16_384 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: instructions });
  const grammar = await llama.createGrammarForJsonSchema(createResponseSchema(headers));
  const requestTokens = model.tokenize(`${instructions}\n${recipe}`).length;
  const startedAt = performance.now();

  try {
    const output = await session.prompt(recipe, { grammar, maxTokens: 8_192, temperature: 0 });
    const groups = JSON.parse(output);

    return {
      groups,
      output,
      requestTokens,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await context.dispose();
  }
}
