import { EngineBrowserClient } from "./client-browser";
import {
  type EventStreamOptions,
  parseSendAccepted,
  type SendAccepted,
  type SendOptions,
} from "./client-contract";
import { createRequester, EngineError, type Requester } from "./requester";
import { readEventStream } from "./sse-read";
import type {
  EngineClientConfig,
  GenerateAgentResponse,
  HealthResponse,
  ProviderId,
  ProviderInfo,
  ProviderUsage,
  Settings,
  VersionResponse,
} from "./types";

export type {
  EventStreamOptions,
  SendAccepted,
  SendOptions,
} from "./client-contract";
export { EngineError };

export class HoustonEngineClient extends EngineBrowserClient {
  private readonly requester: Requester;

  constructor(config: EngineClientConfig) {
    super();
    this.requester = createRequester(config);
  }

  protected request(path: string, init?: RequestInit): Promise<Response> {
    return this.requester.request(path, init);
  }

  protected json<T>(path: string, init?: RequestInit): Promise<T> {
    return this.requester.json<T>(path, init);
  }

  health() {
    return this.json<HealthResponse>("/health");
  }
  version() {
    return this.json<VersionResponse>("/version");
  }

  listProviders(opts?: { signal?: AbortSignal }) {
    return this.json<ProviderInfo[]>("/providers", { signal: opts?.signal });
  }
  listProviderUsage() {
    return this.json<ProviderUsage[]>("/providers/usage");
  }
  setSettings(input: {
    activeProvider?: ProviderId;
    model?: string;
    effort?: string;
  }) {
    return this.json<Settings>("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }
  claimActiveProvider(provider: ProviderId) {
    return this.json<Settings>("/settings/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
  }

  generateAgent(
    description: string,
    opts: { provider?: string; model?: string; signal?: AbortSignal } = {},
  ) {
    return this.json<GenerateAgentResponse>("/generate-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        provider: opts.provider,
        model: opts.model,
      }),
      signal: opts.signal,
    });
  }

  async sendMessage(
    id: string,
    text: string,
    opts: SendOptions = {},
  ): Promise<SendAccepted> {
    const res = await this.request(
      `/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          nonce: opts.nonce,
          provider: opts.provider,
          model: opts.model,
          effort: opts.effort,
          mode: opts.mode,
          displayText: opts.displayText,
          mentions: opts.mentions,
          approvals: opts.approvals,
          missionTitle: opts.missionTitle,
          grants: opts.grants,
        }),
        signal: opts.signal,
      },
    );
    return parseSendAccepted(await res.text());
  }

  async streamEvents(id: string, opts: EventStreamOptions): Promise<void> {
    const cursor = opts.after !== undefined ? `?after=${opts.after}` : "";
    const res = await this.request(
      `/conversations/${encodeURIComponent(id)}/events${cursor}`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: opts.signal,
      },
    );
    if (!res.body)
      throw new EngineError(0, "no response body for event stream");
    await readEventStream(res.body, opts.onEvent, opts.onActivity);
  }
}
