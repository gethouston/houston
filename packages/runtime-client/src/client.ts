import type {
  AuthStatus,
  ConversationHistory,
  ConversationSummary,
  EngineClientConfig,
  HealthResponse,
  LoginInfo,
  ProviderId,
  ProviderInfo,
  Settings,
  VersionResponse,
  WireEvent,
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
  /** Called for every event scoped to this conversation. */
  onEvent: (event: WireEvent) => void;
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
  setSettings(input: { activeProvider?: ProviderId; model?: string }) {
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
   */
  startLogin(provider: ProviderId, deviceAuth = true) {
    const suffix = deviceAuth ? "" : "?deviceAuth=false";
    return this.json<LoginInfo>(`/auth/${provider}/login${suffix}`, {
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
   * Store a pasted API key for an api-key provider (OpenCode Zen / Go). No OAuth
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
  cancel(id: string) {
    return this.json<{ ok: boolean }>(
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
   * no other conversation's events can arrive here.
   */
  async streamEvents(id: string, opts: EventStreamOptions): Promise<void> {
    const res = await this.request(
      `/conversations/${encodeURIComponent(id)}/events`,
      {
        method: "GET",
        headers: { Accept: "text/event-stream" },
        signal: opts.signal,
      },
    );
    if (!res.body)
      throw new EngineError(0, "no response body for event stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx = buf.indexOf("\n\n");
      while (idx >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        idx = buf.indexOf("\n\n");
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue; // skip SSE comments (": hb" heartbeats, ": connected")
        opts.onEvent(JSON.parse(line.slice(5).trim()) as WireEvent);
      }
    }
  }
}
