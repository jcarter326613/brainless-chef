import { describe, expect, it } from "vitest";

import {
  ParameterStore,
  parameterReference,
  type ParameterReader,
} from "../../src/config/parameters.js";

describe("parameterReference", () => {
  it("builds the reference for an environment parameter", () => {
    expect(parameterReference("brainlesschef", "development", "public-url")).toBe(
      "projects/brainlesschef/locations/global/parameters/development-api-public-url",
    );
  });
});

describe("ParameterStore", () => {
  function makeStore(overrides: Record<string, string>): ParameterStore {
    const payloadsByReference = new Map<string, string>();
    for (const [parameterName, value] of Object.entries(overrides)) {
      payloadsByReference.set(
        `${parameterReference("brainlesschef", "production", parameterName)}/versions/v-current`,
        value,
      );
    }

    const reader: ParameterReader = {
      async listVersions(reference: string): Promise<string[]> {
        const version = `${reference}/versions/v-current`;
        return payloadsByReference.has(version) ? [version] : [];
      },
      async renderVersion(reference: string): Promise<string | undefined> {
        return payloadsByReference.get(reference);
      },
    };

    return new ParameterStore({ environment: "production", projectId: "brainlesschef", reader });
  }

  it("returns environment variable overrides from the newest parameter versions", async () => {
    const store = makeStore({
      "mail-from": "no-reply@brainlesschef.com",
      "mailtrap-mode": "sending",
      "public-url": "https://brainlesschef.com/api",
    });

    await expect(store.fetchEnvironmentOverrides()).resolves.toEqual({
      MAIL_FROM: "no-reply@brainlesschef.com",
      MAILTRAP_MODE: "sending",
      PUBLIC_API_URL: "https://brainlesschef.com/api",
    });
  });

  it("omits overrides for parameters that render without a value", async () => {
    const store = makeStore({});

    await expect(store.fetchEnvironmentOverrides()).resolves.toEqual({});
  });
});
