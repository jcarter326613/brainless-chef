import { describe, expect, it } from "vitest";

import {
  ParameterStore,
  parameterVersionReference,
  type ParameterReader,
} from "../../src/config/parameters.js";

describe("parameterVersionReference", () => {
  it("builds the render reference for an environment parameter", () => {
    expect(parameterVersionReference("brainlesschef", "development", "site-origin")).toBe(
      "projects/brainlesschef/locations/global/parameters/api-site-origin-development/versions/latest",
    );
  });
});

describe("ParameterStore", () => {
  function makeStore(overrides: Record<string, string>): ParameterStore {
    const payloadsByReference = new Map<string, string>();
    for (const [parameterName, value] of Object.entries(overrides)) {
      payloadsByReference.set(
        parameterVersionReference("brainlesschef", "production", parameterName),
        value,
      );
    }

    const reader: ParameterReader = {
      async renderVersion(reference: string): Promise<string | undefined> {
        return payloadsByReference.get(reference);
      },
    };

    return new ParameterStore({ environment: "production", projectId: "brainlesschef", reader });
  }

  it("returns environment variable overrides from latest parameter versions", async () => {
    const store = makeStore({
      "site-origin": "https://brainlesschef.com",
      "mail-from": "no-reply@brainlesschef.com",
      "mailtrap-mode": "sending",
    });

    await expect(store.fetchEnvironmentOverrides()).resolves.toEqual({
      MAIL_FROM: "no-reply@brainlesschef.com",
      MAILTRAP_MODE: "sending",
      SITE_ORIGIN: "https://brainlesschef.com",
    });
  });

  it("omits overrides for parameters that render without a value", async () => {
    const store = makeStore({});

    await expect(store.fetchEnvironmentOverrides()).resolves.toEqual({});
  });
});