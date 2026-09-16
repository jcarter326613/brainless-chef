import { database } from "@brainless-chef/database";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MailService } from "./services/mail-service.js";

const config = loadConfig(process.env);

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