import { createRequester, EngineError, type Requester } from "./requester";
import { readEventStream } from "./sse-read";
import type {
  AuthStatus,
  ConversationHistory,
  ConversationSummary,
  CustomEndpoint,
  EngineClientConfig,
  GenerateAgentResponse,
  HealthResponse,
  LoginInfo,
  ProviderId,
  ProviderInfo,
  Settings,
  VersionResponse,
  WireFrame,
} from "./types";

export { EngineError };

export interface EventStreamOptions {
  /** Abort to close the stream (e.g. when switching conversations). */
  signal?: AbortSignal;
  /**
   * Resume cursor (`?after=<seq>`): the server replays only frames with
   * `seq > after` from its in-flight-turn buffer — no `sync`, no gap, no
   * duplicate. An unserviceable cursor gets a `sync` with `resync: true`
   * instead. Omit for the fresh-connect contract (`sync`, then live frames).
   */
  after?: number;
  /** Called for every event scoped to this conversation. */
  onEvent: (event: WireFrame) => void;
  /**
   * Called whenever ANY bytes arrive on the stream — including SSE comment
   * frames (": connected", ": hb" heartbeats) that never reach `onEvent`.
   * Feeds idle watchdogs (see `streamEventsResumable`): a server heartbeating
   * every 15s keeps this firing even when no turn is running.
   */
  onActivity?: () => void;
}

export interface SendOptions {
  /** Echoed back on the `user` event so the sender can dedupe its own message. */
  nonce?: string;
  /**
   * Per-turn provider pin (engine provider id). The turn runs on THIS provider
   * — never auth-gated onto another one — exactly like a routine's pin. Chats
   * pass their own pinned provider here so a conversation always runs on the
   * provider the user picked IN that chat, regardless of the agent-wide
   * settings (HOU-695). Omitted, the runtime resolves from its settings.
   */
  provider?: string;
  /** Per-turn model pin (must belong to `provider`). */
  model?: string;
  /** Per-turn reasoning-effort pin. */
  effort?: string;
  /**
   * Per-turn execution mode. "execute" (the default for an unpinned turn) =
   * full read/write/act; "plan" = read-only tools plus a planning overlay.
   * Omitted, the runtime runs the turn as "execute". Mirrors the protocol's
   * `TurnMode` (kept inline — this package stays zero-dep, like `effort`).
   */
  mode?: "execute" | "plan";
  signal?: AbortSignal;
}

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
export class HoustonEngineClient {
  private readonly requester: Requester;

  constructor(config: EngineClientConfig) {
    this.requester = createRequester(config);
  }

  private request(path: string, init?: RequestInit): Promise<Response> {
    return this.requester.request(path, init);
  }

  private json<T>(path: string, init?: RequestInit): Promise<T> {
    return this.requester.json<T>(path, init);
  }

  // --- meta ---
  health() {
    return this.json<HealthResponse>("/health");
  }
  version() {
    return this.json<VersionResponse>("/version");
  }

  // --- providers, settings & auth (subscription OAuth) ---
  listProviders() {
    return this.json<ProviderInfo[]>("/providers");
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
  authStatus() {
    return this.json<AuthStatus>("/auth/status");
  }
  /**
   * Start login for a provider. Returns a `LoginInfo`: `url` (local Claude or
   * co-located Codex, loopback), `auth_code` (headless Claude — open the url,
   * then `completeLogin` with the code Claude shows), or `device_code` (remote
   * Codex). `deviceAuth: false` (sent only by the co-located desktop client)
   * asks Codex for the browser/loopback login instead of the device code;
   * default true keeps the device-code path for remote webapp clients.
   * `enterpriseDomain` (GitHub Copilot Enterprise only) runs the device-code flow
   * against the company's GitHub (e.g. `acme.ghe.com`) instead of github.com.
   */
  startLogin(
    provider: ProviderId,
    deviceAuth = true,
    enterpriseDomain?: string,
  ) {
    const params = new URLSearchParams();
    if (!deviceAuth) params.set("deviceAuth", "false");
    if (enterpriseDomain) params.set("enterpriseDomain", enterpriseDomain);
    const qs = params.toString();
    return this.json<LoginInfo>(
      `/auth/${provider}/login${qs ? `?${qs}` : ""}`,
      { method: "POST" },
    );
  }
  /**
   * Cancel an in-flight OAuth login on the runtime itself — aborts the
   * device-code polling / closes the loopback callback server and frees the
   * login slot so a retry starts clean. Benign when nothing is in flight.
   */
  cancelLogin(provider: ProviderId) {
    return this.json<{ ok: boolean }>(`/auth/${provider}/login/cancel`, {
      method: "POST",
    });
  }
  /** Submit a pasted code (the `auth_code` headless Claude path). */
  completeLogin(provider: ProviderId, code: string) {
    return this.json<{ ok: boolean }>(`/auth/${provider}/login/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }
  /**
   * Store a pasted API key for an api-key provider. No OAuth
   * dance: the key is persisted and used directly for the provider's built-in
   * OpenAI-compatible gateway.
   */
  setApiKey(provider: ProviderId, key: string) {
    return this.json<{ ok: boolean }>(`/auth/${provider}/api-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
  }
  /**
   * Connect an OpenAI-compatible (local) server: a base URL + model id, plus an
   * optional name/context window and an optional key (blank for keyless servers
   * like Ollama). LOCAL profile only.
   */
  setCustomEndpoint(endpoint: CustomEndpoint) {
    return this.json<{ ok: boolean }>("/providers/openai-compatible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint),
    });
  }
  logout(provider: ProviderId) {
    return this.json<{ ok: boolean }>(`/auth/${provider}/logout`, {
      method: "POST",
    });
  }

  // --- conversations ---
  listConversations() {
    return this.json<ConversationSummary[]>("/conversations");
  }
  getHistory(id: string) {
    return this.json<ConversationHistory>(
      `/conversations/${encodeURIComponent(id)}/messages`,
    );
  }
  /**
   * Abort a conversation's in-flight turn. `cancelled` reports whether a live
   * turn was actually stopped: `false` means there was nothing in flight (the
   * turn is orphaned — e.g. the runtime restarted), so no terminal event will
   * follow and the caller must settle any stuck "running" UI itself.
   */
  cancel(id: string) {
    return this.json<{ ok: boolean; cancelled: boolean }>(
      `/conversations/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    );
  }
  renameConversation(id: string, title: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
  }
  /** Delete the conversation: transcript, live session, and pi session history. */
  deleteConversation(id: string) {
    return this.json<{ ok: boolean }>(
      `/conversations/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );
  }
  /** Generate + persist a short LLM title; returns it. */
  summarizeTitle(id: string) {
    return this.json<{ title: string }>(
      `/conversations/${encodeURIComponent(id)}/title`,
      { method: "POST" },
    );
  }
  /**
   * Title an arbitrary excerpt (the composer's first message), with no stored
   * conversation. Returns "" when the model emits nothing — the caller falls
   * back to truncation.
   */
  summarizeText(text: string) {
    return this.json<{ title: string }>("/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
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
