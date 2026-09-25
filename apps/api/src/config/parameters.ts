import { ParameterManagerClient } from "@google-cloud/parametermanager";

const PARAMETER_NAMES = ["mail-from", "mailtrap-mode", "public-url"] as const;
const MAILTRAP_TEST_INBOX_ID_PARAMETER_NAME = "mailtrap-test-inbox-id";

export type RuntimeEnvironmentOverrides = {
  MAIL_FROM?: string;
  MAILTRAP_MODE?: string;
  MAILTRAP_TEST_INBOX_ID?: string;
  PUBLIC_API_URL?: string;
};

export interface ParameterReader {
  listVersions(reference: string): Promise<string[]>;
  renderVersion(reference: string): Promise<string | undefined>;
}

export interface ParameterStoreOptions {
  environment: string;
  projectId: string;
  reader: ParameterReader;
}

export function parameterReference(
  projectId: string,
  environment: string,
  parameterName: string,
): string {
  return `projects/${projectId}/locations/global/parameters/${environment}-api-${parameterName}`;
}

export class GoogleParameterReader implements ParameterReader {
  private readonly client: ParameterManagerClient;

  constructor(projectId: string) {
    this.client = new ParameterManagerClient({ projectId });
  }

  async listVersions(reference: string): Promise<string[]> {
    try {
      const [versions] = await this.client.listParameterVersions({ parent: reference });
      return versions
        .sort((left, right) => {
          const leftTime = Number(left.createTime?.seconds ?? 0);
          const rightTime = Number(right.createTime?.seconds ?? 0);
          return rightTime - leftTime;
        })
        .flatMap((version) => (version.name == null ? [] : [version.name]));
    } catch (error) {
      console.error(`Failed to list parameter versions for ${reference}.`, error);
      return [];
    }
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
      PARAMETER_NAMES.map(async (parameterName) => {
        const [version] = await this.reader.listVersions(
          parameterReference(this.projectId, this.environment, parameterName),
        );
        return version == null ? undefined : this.reader.renderVersion(version);
      }),
    );

    const overrides: RuntimeEnvironmentOverrides = {};
    const [mailFrom, mailtrapMode, publicApiUrl] = values;
    if (mailFrom) {
      overrides.MAIL_FROM = mailFrom;
    }
    if (mailtrapMode) {
      overrides.MAILTRAP_MODE = mailtrapMode;
    }
    if (mailtrapMode === "sandbox") {
      const [version] = await this.reader.listVersions(
        parameterReference(
          this.projectId,
          this.environment,
          MAILTRAP_TEST_INBOX_ID_PARAMETER_NAME,
        ),
      );
      const mailtrapTestInboxId =
        version == null ? undefined : await this.reader.renderVersion(version);
      if (mailtrapTestInboxId) {
        overrides.MAILTRAP_TEST_INBOX_ID = mailtrapTestInboxId;
      }
    }
    if (publicApiUrl) {
      overrides.PUBLIC_API_URL = publicApiUrl;
    }
    return overrides;
  }
}
