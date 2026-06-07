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

export interface StreamOptions {
  signal?: AbortSignal;
  onEvent?: (event: WireEvent) => void;
}

/**
 * Typed client for the Houston engine. Zero dependencies; uses fetch + SSE.
 *
 *   const engine = new HoustonEngineClient({ baseUrl: "http://127.0.0.1:4317" });
 *   if (!(await engine.authStatus()).anthropicConfigured) {
 *     const { url } = await engine.startAnthropicLogin();
 *     window.open(url);  // poll authStatus() until anthropicConfigured
 *   }
 *   for await (const ev of engine.streamMessage("main", "hello")) {
 *     if (ev.type === "text") render(ev.data);
 *   }
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
    if (!res.ok) throw new EngineError(res.status, await res.text().catch(() => ""));
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
  /** Start login for a provider. Returns a `url` (Claude) or a device code (Codex). */
  startLogin(provider: ProviderId) {
    return this.json<LoginInfo>(`/auth/${provider}/login`, { method: "POST" });
  }
  /** Submit a pasted code (Anthropic remote / paste-code path). */
  completeLogin(provider: ProviderId, code: string) {
    return this.json<{ ok: boolean }>(`/auth/${provider}/login/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  }
  logout(provider: ProviderId) {
    return this.json<{ ok: boolean }>(`/auth/${provider}/logout`, { method: "POST" });
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

  /**
   * Send a message and stream the turn's events. Async generator:
   *   for await (const ev of engine.streamMessage(id, text)) { ... }
   */
  async *streamMessage(
    id: string,
    text: string,
    opts: StreamOptions = {},
  ): AsyncGenerator<WireEvent, void, unknown> {
    const res = await this.request(
      `/conversations/${encodeURIComponent(id)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: opts.signal,
      },
    );
    if (!res.body) throw new EngineError(0, "no response body for stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const event = JSON.parse(line.slice(5).trim()) as WireEvent;
        opts.onEvent?.(event);
        yield event;
        if (event.type === "done" || event.type === "error") return;
      }
    }
  }

  /** Callback convenience wrapper over streamMessage. */
  async sendMessage(
    id: string,
    text: string,
    onEvent: (event: WireEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    for await (const _ of this.streamMessage(id, text, { onEvent, signal })) {
      // onEvent already called
    }
  }
}
