import { database } from "@brainless-chef/database";

import { createApp } from "./app.js";
import { loadConfig } from "./config/config.js";
import { GoogleParameterReader, ParameterStore } from "./config/parameters.js";
import { MailService } from "./services/mail-service.js";

async function loadParameterOverrides(): Promise<Record<string, string>> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const environment = process.env.APP_ENVIRONMENT;
  if (!projectId || !environment) {
    return {};
  }
  const parameters = new ParameterStore({
    environment,
    projectId,
    reader: new GoogleParameterReader(projectId),
  });
  return parameters.fetchEnvironmentOverrides();
}

async function main(): Promise<void> {
  const parameterOverrides = await loadParameterOverrides();
  const config = loadConfig({ ...process.env, ...parameterOverrides });

  const mailer = new MailService({
    apiToken: config.mailtrapApiToken,
    fromEmail: config.mailFrom,
    fromName: "Brainless Chef",
    sandbox: config.mailtrapMode === "sandbox",
  });

  const app = createApp({ config, database, mailer });

  app.listen(config.port, () => {
    console.log(`Brainless Chef server listening on port ${config.port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start Brainless Chef server.", error);
  process.exit(1);
});