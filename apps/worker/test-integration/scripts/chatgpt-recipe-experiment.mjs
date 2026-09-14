import { homedir } from "node:os";
import { join } from "node:path";

import { getLlama, LlamaChatSession } from "node-llama-cpp";

const modelPath = join(
  homedir(),
  ".cache",
  "brainless-chef",
  "models",
  "bb5d59e06d9551d752d08b292a50eb208b07ab1f",
  "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf",
);

const instructions = `
Separate the supplied recipe into a collection of ingredients and directions.

- If the ingredients or directions are separated into different components or sections, include information 
  about the name of the component in the output object or null otherwise.  When including the name, also include 
  whether the name is a noun, an optional noun or "other" such as a verb in the type field.  Component names
  should not have extra punctuation such as colons.
- Component names should not be repeated as an ingredient or direction unless they appear separately.
- "Ingredients", "Directions", "Instructions", or synomyms to those, do not indicate named components.  
- Every other named heading must be represented as the component of its own top-level object. Do not merge the content of distinct named sections.
- We do want to have the ingredients section and directions sections in separate components in the output JSON.  
  If we are in the ingredients section, each ingredient should be supplied as a separate string in an array of 
  ingredient strings.  Similarly, each complete direction sentence or sentences should be given in the direction 
  array as its own string.
- Keep the same order of the ingredients and directions as how they appeared in the recipe.
- Don't de-duplicate repeated ingredients.
- Strings may be split only at sentence boundaries, while their text and punctuation must otherwise remain unchanged.
- Line numbering or bulleting should be stripped.
- Component names may start with a number such as "4. Sauce" but since we are discarding line numbers, the "4." doesn't count and in this scenario, "Sauce" would be a component.
- The directions should have only one sentence per array string except in the case of fragment sentences which should be combined into the same string when they are adjacent and related.
- Each top level object in the returned structure should correspond to a single component that can be found in the ingredients or directions sections.  Ingredients and directions should not both be present in the same object.
- Return top-level output objects covering all source content. Every ingredient entry and direction sentence must appear exactly once. An empty collection or omitted source section is incorrect.
- For example, a named ingredient section is represented as {"component":{"name":"Sauce","type":"noun"},"ingredients":["ingredient text"],"directions":null}. A named direction section is represented as {"component":{"name":"Sauce","type":"noun"},"ingredients":null,"directions":["direction sentence"]}.
`

const responseSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      component: {
        oneOf: [
          { 
            type: "object",
            properties: {
              name: { type: "string" },
              type: { enum: ["noun", "optional noun", "other"] },
            },
            required: ["name", "type"],
            additionalProperties: false,
          },
          { type: "null" }
        ]
      },
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
}

const recipe = `### Ingredients

- Cake:
- 3/4 cups caster sugar (superfine sugar)
- ▢120g/ 1/2 cup unsalted butter , softened (1 US stick)
- ▢2 large eggs , at room temperature (Note 1)
- ▢2 tsp vanilla
- ▢1 tbsp oil – canola, vegetable or any other plain flavoured
- ▢1 1/4 cups plain flour / all-purpose flour
- ▢2 1/2 tsp baking powder
- ▢1/2 tsp cooking salt / kosher salt
- ▢3/4 cup sour cream at room temperature , mixed well before use (Note 2)
- Crumb:
- ▢3/4 cup (tightly packed) brown sugar
- ▢3/4 cup plain flour / all-purpose flour
- ▢1 tbsp cinnamon powder
- ▢1/4 tsp cooking salt / kosher salt
- ▢90g/ 6 tbsp unsalted butter , softened
- Optional glaze:
- ▢3/4 cup icing sugar / powdered sugar , sifted
- ▢1/4 tsp vanilla extract
- ▢4 tsp milk , preferably full fat but low / 0% fat ok

### Instructions

1. Crumbs:
2. Grease and line a 20cm/8" square pan with baking paper (parchment paper), with overhang so you can lift the cake out once baked.
3. Preheat oven to 160° fan-forced (350°F /180°C regular ovens).
4. Crumb topping first – Put all the Crumb ingredients into a bowl. Using an handheld electric beater or a stand mixer with the paddle attachment, beat until the butter breaks up into crumbs (about 20 seconds). Then finish the job with your fingertips, rubbing the butter into the flour mixture until there are none larger than the size of small peas. Place in the fridge until required.
5. Cake batter:
6. Dry ingredients – Whisk the flour, baking powder and salt in a medium bowl, then set aside.
7. Cream butter – Put the butter and sugar in a separate bowl. Using the same beater (no need to clean), beat for 1 1/2 to 2 minutes until the butter is light and creamy. Beat in the eggs one at a time, then the vanilla and oil. Beat well until thoroughly combined.
8. Add flour in batches – Add one third of the flour and sour cream, then beat on the lowest speed until you almost can't see flour. Repeat again twice, then finish mixing with a rubber spatula until you can no longer see flour (safer to finish by hand to avoid over-mixing to ensure the cake stays soft).
9. Assemble and bake:
10. Layer – Spread just over half the batter in the pan. (Note 2) Sprinkle then spread evenly with 1 cup of the crumb topping. Dollop spoonfuls of the remaining batter across the surface and spread. A small offset spatula is useful here. Do the edges first, then the middle. Don't stress if you mess this up a bit, this is a rustic cake afterall!
11. Chunky crumb – Grab handfuls of the crumb topping in your fist to clump together then break up into chunks across the surface.
12. Bake for 40 to 45 minutes or until a skewer inserted into the centre comes out clean. Check first at 40 minutes.
13. Cool for 15 minutes in the pan before using the paper overhang to lift it out onto a rack. Let it cool for another 30 minutes before drizzling with glaze (if using), then slice to enjoy!
14. Glaze:
15. Put ingredients in bowl and whisk to combine. Glazes crust so it’s best to use immediately.`;

const llama = await getLlama({ build: "auto", gpu: "metal", progressLogs: "stderr" });
const model = await llama.loadModel({ modelPath });
const context = await model.createContext({ contextSize: 16_384 });
const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: instructions });
const grammar = await llama.createGrammarForJsonSchema(responseSchema);
const requestTokens = model.tokenize(`${instructions}\n${recipe}`).length;
const startedAt = performance.now();

try {
  const output = await session.prompt(recipe, { grammar, maxTokens: 8_192, temperature: 0 });
  const response = JSON.parse(output);
  console.error(`request tokens: ${requestTokens}`);
  console.error(`completed in ${Math.round(performance.now() - startedAt)}ms`);
  console.log(response);
  console.log(output);
} finally {
  await context.dispose();
}
