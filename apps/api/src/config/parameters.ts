import { ParameterManagerClient } from "@google-cloud/parametermanager";

const PARAMETER_NAMES = ["site-origin", "mail-from", "mailtrap-mode"] as const;

export type RuntimeEnvironmentOverrides = {
  MAIL_FROM?: string;
  MAILTRAP_MODE?: string;
  SITE_ORIGIN?: string;
};

export interface ParameterReader {
  renderVersion(reference: string): Promise<string | undefined>;
}

export interface ParameterStoreOptions {
  environment: string;
  projectId: string;
  reader: ParameterReader;
}

export function parameterVersionReference(
  projectId: string,
  environment: string,
  parameterName: string,
): string {
  return `projects/${projectId}/locations/global/parameters/api-${parameterName}-${environment}/versions/latest`;
}

export class GoogleParameterReader implements ParameterReader {
  private readonly client: ParameterManagerClient;

  constructor(projectId: string) {
    this.client = new ParameterManagerClient({ projectId });
  }

  async renderVersion(reference: string): Promise<string | undefined> {
    try {
      const [response] = await this.client.renderParameterVersion({ name: reference });
      const payload = response.renderedPayload;
      return payload == null ? undefined : String(payload);
    } catch (error) {
      console.error(`Failed to render parameter ${reference}.`, error);
      return undefined;
    }
  }
}

export class ParameterStore {
  private readonly environment: string;
  private readonly projectId: string;
  private readonly reader: ParameterReader;

  constructor(options: ParameterStoreOptions) {
    this.environment = options.environment;
    this.projectId = options.projectId;
    this.reader = options.reader;
  }

  async fetchEnvironmentOverrides(): Promise<RuntimeEnvironmentOverrides> {
    const values = await Promise.all(
      PARAMETER_NAMES.map((parameterName) =>
        this.reader.renderVersion(
          parameterVersionReference(this.projectId, this.environment, parameterName),
        ),
      ),
    );

    const overrides: RuntimeEnvironmentOverrides = {};
    const [siteOrigin, mailFrom, mailtrapMode] = values;
    if (siteOrigin) {
      overrides.SITE_ORIGIN = siteOrigin;
    }
    if (mailFrom) {
      overrides.MAIL_FROM = mailFrom;
    }
    if (mailtrapMode) {
      overrides.MAILTRAP_MODE = mailtrapMode;
    }
    return overrides;
  }
}