import { readEventStream } from "./sse-read";
import type {
  AuthStatus,
  ConversationHistory,
  ConversationSummary,
  CustomEndpoint,
  EngineClientConfig,
  HealthResponse,
  LoginInfo,
  ProviderId,
  ProviderInfo,
  Settings,
  VersionResponse,
  WireFrame,
} from "./types";

export class EngineError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`engine request failed (${status}): ${body}`);
    this.name = "EngineError";
  }
}

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
  private base: string;
  private token?: string;
  private fetchImpl: typeof fetch;

  constructor(config: EngineClientConfig) {
    this.base = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const res = await this.fetchImpl(this.base + path, {
      ...init,
      headers: this.headers(init?.headers as Record<string, string>),
    });
    if (!res.ok)
      throw new EngineError(res.status, await res.text().catch(() => ""));
    return res;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await this.request(path, init)).json() as Promise<T>;
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
      body: JSON.stringify({ text, nonce: opts.nonce }),
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
