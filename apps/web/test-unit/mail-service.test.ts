import { describe, expect, it, vi } from "vitest";

const mailtrapMocks = vi.hoisted(() => ({
  MailtrapClient: vi.fn(),
  send: vi.fn(),
}));

vi.mock("mailtrap", () => ({
  MailtrapClient: mailtrapMocks.MailtrapClient,
}));

import { MailtrapClient } from "mailtrap";

import { MailService } from "../api/services/mail-service.js";

describe("MailService", () => {
  it("creates a Mailtrap client with the token and sandbox flag", () => {
    mailtrapMocks.MailtrapClient.mockImplementation(() => ({ send: mailtrapMocks.send }));
    const service = new MailService({
      apiToken: "test-token",
      fromEmail: "no-reply@example.com",
      fromName: "Brainless Chef",
      sandbox: true,
    });

    expect(MailtrapClient).toHaveBeenCalledWith({ token: "test-token", sandbox: true });

    const loginUrl = "https://example.test/api/auth/verify-login?token=abc";
    const sent = service.sendLoginLink({ loginUrl, to: "user@example.com" });
    expect(mailtrapMocks.send).toHaveBeenCalledWith({
      category: "login-link",
      from: { email: "no-reply@example.com", name: "Brainless Chef" },
      subject: "Sign in to Brainless Chef",
      text: `Click this link to sign in to Brainless Chef:\n\n${loginUrl}`,
      to: [{ email: "user@example.com" }],
    });

    return sent;
  });
});