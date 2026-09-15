/**
 * The credential half of {@link HoustonEngineClient}: the `/auth/*` routes that
 * connect, complete, and forget a provider login, plus the one
 * OpenAI-compatible endpoint registration that connects a provider the same way
 * without an OAuth dance.
 *
 * Split out of `./client.ts` for size, not for reach: these are methods OF the
 * conversation client, so they stay on it. The base declares only the transport
 * it needs ({@link json}) and the concrete client supplies it — which is what
 * keeps a caller's `engine.startLogin(...)` and the assistant catalog's
 * two-hop route derivation both seeing exactly what they saw inline.
 */

import type {
  AuthStatus,
  CustomEndpoint,
  LoginInfo,
  ProviderId,
} from "./types";

/**
 * The provider-credential routes, mixed into the engine client by inheritance.
 * Abstract on purpose: it owns no transport, so there is one place
 * ({@link HoustonEngineClient}) that decides how a request is made.
 */
export abstract class EngineCredentialClient {
  /** The concrete client's JSON transport, rooted at its base URL. */
  protected abstract json<T>(path: string, init?: RequestInit): Promise<T>;

  authStatus() {
    return this.json<AuthStatus>("/auth/status");
  }
  // Every `/auth/:provider/…` path below ESCAPES the provider id rather than
  // splicing it. `ProviderId` widens to `(string & {})` — any pi-ai provider id,
  // not just the named slugs — so the escape is byte-identical only for those
  // slugs, and for an arbitrary id it is what stops a `/` or `?` in the id from
  // splicing the path. It also buys a path the catalog generator can derive,
  // because an unescaped interpolation is refused rather than guessed
  // (scripts/assistant-catalog/assistant-path-parts.ts).
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
      `/auth/${encodeURIComponent(provider)}/login${qs ? `?${qs}` : ""}`,
      { method: "POST" },
    );
  }
  /**
   * Cancel an in-flight OAuth login on the runtime itself — aborts the
   * device-code polling / closes the loopback callback server and frees the
   * login slot so a retry starts clean. Benign when nothing is in flight.
   */
  cancelLogin(provider: ProviderId) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/login/cancel`,
      {
        method: "POST",
      },
    );
  }
  /** Submit a pasted code (the `auth_code` headless Claude path). */
  completeLogin(provider: ProviderId, code: string) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/login/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
    );
  }
  /**
   * Store a pasted API key for an api-key provider. No OAuth
   * dance: the key is persisted and used directly for the provider's built-in
   * OpenAI-compatible gateway. Azure OpenAI additionally sends its
   * per-resource `endpoint` (PRODUCT-1477); other providers omit it.
   */
  setApiKey(provider: ProviderId, key: string, endpoint?: string) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, ...(endpoint ? { endpoint } : {}) }),
      },
    );
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
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/logout`,
      {
        method: "POST",
      },
    );
  }
}
