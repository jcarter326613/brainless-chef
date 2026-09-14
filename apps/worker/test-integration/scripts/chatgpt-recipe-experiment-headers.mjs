import { LlamaChatSession } from "node-llama-cpp";

const instructions = `
Extract the complete ordered list of component headings nested within the supplied recipe's structural sections.

- First identify the heading hierarchy. Top-level recipe headings classify broad content and are always structural; never return them.
- A component heading is a child label within a structural section whose following entries or sentences belong to that component. It may be a lower-level Markdown heading, bullet label, numbered label, or plain label.
- Evaluate each source line verbatim. A component heading must occupy its entire source line after removing only list numbering, bullets, and a trailing colon. Do not turn a title-like prefix in an ingredient or direction sentence into a heading.
- A source line containing a complete sentence, action, instruction, ingredient quantity, or other body content is never a heading, even when it begins with title-like words.
- Each returned name must exactly equal a complete component-heading source line after removing only its list marker and trailing colon. A returned name must never be a substring of a source line.
- Structural labels that identify broad recipe sections, such as ingredients, directions, instructions, methods, or their synonyms, are not component headings and must not be returned.
- Return ingredient component headings in ingredientHeaders and direction component headings in directionHeaders. Preserve source order within each list.
- Return empty header lists when the recipe has no component headings.
- A heading is always a noun or verb that has no context.  Noun examples include, "Sauce", "Pudding", etc.  Verb examples include, "Prepare", "Gather", etc.  These headers tell you the noun or verb but never both and they never provide any context about what to do with the noun or wheat to perform the verb on.

For example, the source "### Ingredients\n- Filling:\n- 200g fruit\n### Instructions\n1. Prepare:\n2. Stir the fruit.\n3. Bake:\n4. Bake until set." produces {"analysis":"Ingredients and instructions are structural sections.","ingredientHeaders":["Filling"],"directionHeaders":["Prepare","Bake"]}.
`;

const responseSchema = {
  type: "object",
  properties: {
    analysis: { type: "string", maxLength: 300 },
    ingredientHeaders: {
      type: "array",
      items: { type: "string" },
    },
    directionHeaders: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["analysis", "ingredientHeaders", "directionHeaders"],
  additionalProperties: false,
};

export async function extractRecipeHeaders({ llama, model, recipe }) {
  const context = await model.createContext({ contextSize: 16_384 });
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: instructions });
  const grammar = await llama.createGrammarForJsonSchema(responseSchema);
  const requestTokens = model.tokenize(`${instructions}\n${recipe}`).length;
  const startedAt = performance.now();

  try {
    const output = await session.prompt(recipe, { grammar, maxTokens: 4_096, temperature: 0 });
    const headerResult = JSON.parse(output);

    console.error(`header request tokens: ${requestTokens}`);
    console.error(`header pass completed in ${Math.round(performance.now() - startedAt)}ms`);
    console.log(headerResult);
    console.log(output);

    return [...headerResult.ingredientHeaders, ...headerResult.directionHeaders];
  } finally {
    await context.dispose();
  }
}
