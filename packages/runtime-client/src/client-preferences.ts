import {
  PREFERENCE_EXISTS_STATUS,
  PREFERENCE_ONLY_IF_ABSENT_FIELD,
} from "@houston/protocol";
import { createRequester, EngineError, type Requester } from "./requester";
import type { EngineClientConfig, PreferenceValue, Workspace } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export class PreferencesClient {
  private readonly r: Requester;

  constructor(config: EngineClientConfig) {
    this.r = createRequester(config);
  }

  async getPreference(key: string): Promise<string | null> {
    return (
      await this.r.json<PreferenceValue>(
        `/v1/preferences/${encodeURIComponent(key)}`,
      )
    ).value;
  }

  async setPreference(
    key: string,
    value: string | null,
  ): Promise<string | null> {
    return (
      await this.r.json<PreferenceValue>(
        `/v1/preferences/${encodeURIComponent(key)}`,
        {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ value }),
        },
      )
    ).value;
  }

  async createPreference(
    key: string,
    value: string,
  ): Promise<{ created: boolean; value: string }> {
    try {
      const out = await this.r.json<PreferenceValue>(
        `/v1/preferences/${encodeURIComponent(key)}`,
        {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            value,
            [PREFERENCE_ONLY_IF_ABSENT_FIELD]: true,
          }),
        },
      );
      return { created: true, value: out.value ?? value };
    } catch (err) {
      if (
        !(err instanceof EngineError) ||
        err.status !== PREFERENCE_EXISTS_STATUS
      )
        throw err;
      const stored = (JSON.parse(err.body) as PreferenceValue).value;
      return { created: false, value: stored ?? value };
    }
  }

  setWorkspaceLocale(
    workspaceId: string,
    locale: string | null,
  ): Promise<Workspace> {
    return this.r.json(`/v1/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ locale }),
    });
  }
}
