import { database } from "@brainless-chef/database";

import { loadConfig } from "./config.js";
import { createMigrateApp } from "./migrate-app.js";

const config = loadConfig(process.env);

const app = createMigrateApp({ config, database });

app.listen(config.port, () => {
  console.log(`Brainless Chef migration server listening on port ${config.port}`);
});