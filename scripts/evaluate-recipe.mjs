import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";

const usage = "Usage: pnpm evaluate:recipe -- [--catalog catalog.json] <recipe.txt|->";

function parseOptions(arguments_) {
  let catalogPath;
  let recipePath;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--catalog") {
      const path = arguments_[index + 1];
      if (!path || path.startsWith("-")) throw new Error("--catalog requires a JSON file path.");
      catalogPath = resolve(path);
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`Unknown option ${argument}.`);
    if (recipePath) throw new Error("Specify one recipe file path or - for standard input.");
    recipePath = argument === "-" ? "-" : resolve(argument);
  }

  if (!recipePath) throw new Error(usage);
  return { catalogPath, recipePath };
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const { catalogPath, recipePath } = parseOptions(process.argv.slice(2));

run("docker", ["build", "--file", "apps/worker/Dockerfile", "--tag", "brainless-chef-worker:local", "."]);

const runArguments = ["run", "--rm", "--env", "FIRESTORE_DATABASE_ID=local-evaluation"];
let recipeContainerPath = "-";
if (recipePath === "-") {
  runArguments.push("-i");
} else {
  runArguments.push("--volume", `${dirname(recipePath)}:/recipe:ro`);
  recipeContainerPath = `/recipe/${basename(recipePath)}`;
}

let catalogContainerPath;
if (catalogPath) {
  runArguments.push("--volume", `${dirname(catalogPath)}:/catalog:ro`);
  catalogContainerPath = `/catalog/${basename(catalogPath)}`;
}

runArguments.push("brainless-chef-worker:local", "node", "apps/worker/dist/evaluate-recipe.js");
if (catalogContainerPath) runArguments.push("--catalog", catalogContainerPath);
runArguments.push(recipeContainerPath);
run("docker", runArguments);
