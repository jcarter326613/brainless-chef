import { getLlama } from "node-llama-cpp";

import { extractRecipeHeaders } from "../../src/step-1-extract-recipe-headers.mjs";
import { groupRecipe } from "../../src/step-2-group-recipe.mjs";
import { modelPath } from "./local-model-config.mjs";

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

const headerStep = await extractRecipeHeaders({ llama, model, recipe });
console.error(`header request tokens: ${headerStep.requestTokens}`);
console.error(`header pass completed in ${headerStep.durationMs}ms`);
console.log(headerStep.response);
console.log(headerStep.output);

const groupStep = await groupRecipe({ llama, model, recipe, headers: headerStep.headers });
console.error(`group request tokens: ${groupStep.requestTokens}`);
console.error(`group pass completed in ${groupStep.durationMs}ms`);
console.log(groupStep.groups);
console.log(groupStep.output);

console.log("end")
