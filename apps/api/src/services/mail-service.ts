import { MailtrapClient } from "mailtrap";

export interface Mailer {
  sendLoginLink(options: { to: string; loginUrl: string }): Promise<void>;
}

export class MailService implements Mailer {
  private readonly client: MailtrapClient;
  private readonly fromEmail: string;
  private readonly fromName: string;

  constructor(options: {
    apiToken: string;
    sandbox: boolean;
    testInboxId?: number;
    fromEmail: string;
    fromName: string;
  }) {
    this.client = new MailtrapClient({
      token: options.apiToken,
      sandbox: options.sandbox,
      ...(options.testInboxId == null ? {} : { testInboxId: options.testInboxId }),
    });
    this.fromEmail = options.fromEmail;
    this.fromName = options.fromName;
  }

  async sendLoginLink(options: { to: string; loginUrl: string }): Promise<void> {
    await this.client.send({
      category: "login-link",
      from: { email: this.fromEmail, name: this.fromName },
      to: [{ email: options.to }],
      subject: "Sign in to Brainless Chef",
      text: `Click this link to sign in to Brainless Chef:\n\n${options.loginUrl}`,
    });
  }
}
