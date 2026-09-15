import type { EventStreamOptions, SendOptions } from "./client-contract";
import { EngineConversationsClient } from "./client-conversations";
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

export type { EventStreamOptions, SendOptions } from "./client-contract";
export { EngineError };

/**
 * Typed client for the Houston engine. Zero dependencies; uses fetch + SSE.
 *
 * Conversations are fully isolated. Subscribe to ONE conversation's events with
 * `streamEvents(id)`; trigger a turn with `sendMessage(id, text)`. A conversation's
 * events only ever arrive on that conversation's stream — never another's.
 *
 *   const engine = new HoustonEngineClient({ baseUrl: "http://127.0.0.1:4317" });
 *   const ac = new AbortController();
 *   engine.streamEvents("abc", {
 *     signal: ac.signal,
 *     onEvent: (ev) => { if (ev.type === "text") render(ev.data); },
 *   });
 *   await engine.sendMessage("abc", "List the files here");
 *   // ac.abort() stops observing; the turn keeps running server-side.
 */
export class HoustonEngineClient extends EngineConversationsClient {
  private readonly requester: Requester;

  constructor(config: EngineClientConfig) {
    super();
    this.requester = createRequester(config);
  }

  private request(path: string, init?: RequestInit): Promise<Response> {
    return this.requester.request(path, init);
  }

  protected json<T>(path: string, init?: RequestInit): Promise<T> {
    return this.requester.json<T>(path, init);
  }

  // --- meta ---
  health() {
    return this.json<HealthResponse>("/health");
  }
  version() {
    return this.json<VersionResponse>("/version");
  }

  // --- providers & settings (credentials: client-auth, chats: client-conversations) ---
  /**
   * Every provider the runtime knows, with its `configured` flag and active
   * model. `opts.signal` bounds the call: this is the status probe's only
   * round-trip, and a host that accepts the connection but never answers (a
   * wedged sidecar, a pod stuck mid-boot) would otherwise leave the caller
   * pending forever with no failure to react to (HOU-1153).
   */
  listProviders(opts?: { signal?: AbortSignal }) {
    return this.json<ProviderInfo[]>("/providers", { signal: opts?.signal });
  }
  /**
   * Live per-account usage for every CONNECTED provider — rate-limit windows
   * (Claude 5h/weekly, Codex session/weekly, Copilot quotas) and prepaid
   * balances, fetched by the runtime from each provider's own usage API. One
   * row per connected provider; a provider without a readable usage surface
   * answers an honest non-`ok` status rather than being omitted.
   */
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
  /**
   * Claim the active provider after a credential connect: makes `provider`
   * active ONLY when the agent doesn't already resolve to one (nothing saved,
   * nothing else connected). A connect must never move an existing chat off
   * its provider (HOU-695) — switching is `setSettings`' (the model picker's)
   * job. Returns the settings that ended up saved either way.
   */
  claimActiveProvider(provider: ProviderId) {
    return this.json<Settings>("/settings/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
  }

  /**
   * Create-with-AI: generate an agent name + CLAUDE.md instructions (+ an
   * optional routine suggestion) from a plain-language description, via one
   * one-shot turn on the runtime. `provider` / `model` are pi ids; omitted,
   * the runtime uses its active provider — same resolution as a chat turn.
   */
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

  /**
   * Send a message, triggering a turn. Resolves once the turn is accepted (202);
   * the turn's events stream over `streamEvents(id)`, not this call.
   */
  async sendMessage(
    id: string,
    text: string,
    opts: SendOptions = {},
  ): Promise<void> {
    await this.request(`/conversations/${encodeURIComponent(id)}/messages`, {
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
      }),
      signal: opts.signal,
    });
  }

  /**
   * Subscribe to ONE conversation's live event stream (SSE). Resolves when the
   * stream closes or `opts.signal` aborts. Events are strictly scoped to `id` —
   * no other conversation's events can arrive here. Pass `opts.after` to
   * resume from a seq cursor instead of the fresh-connect `sync`. This is one
   * connection attempt; for a subscription that survives drops, wrap it with
   * `streamEventsResumable`.
   */
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
