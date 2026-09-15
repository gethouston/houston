/**
 * The user-scoped gateway surface: Composio integrations, key/value
 * preferences, and the workspace-locale override. Unlike
 * {@link HoustonEngineClient} (rooted at ONE conversation / agent), these routes
 * are keyed by the caller's verified session `sub` and shared across the user's
 * agents — so they hit the gateway root (`/v1/...`), never `/agents/:id/*`.
 *
 * Both classes share the same {@link Requester} plumbing as the conversation
 * client (base-URL joining, bearer auth, non-2xx → an `EngineError`), so
 * there is one way this package talks to the engine.
 */

import type { IntegrationProviderId } from "@houston/protocol";
import { createRequester, type Requester } from "./requester";
import type {
  EngineClientConfig,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  PreferenceValue,
  Workspace,
} from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

/** Composio is the only integration provider today; the gateway keys every
 *  route on this segment (`/v1/integrations/composio/*`). */
const COMPOSIO = "composio";

/** Integrations (C1). All calls carry the session JWT. */
export class IntegrationsClient {
  private readonly r: Requester;

  constructor(config: EngineClientConfig) {
    this.r = createRequester(config);
  }

  /** Provider readiness list. 503 (no key configured) throws {@link EngineError}. */
  async listIntegrations(): Promise<IntegrationProviderStatus[]> {
    return (
      await this.r.json<{ items: IntegrationProviderStatus[] }>(
        "/v1/integrations",
      )
    ).items;
  }

  /** The full connectable-app catalog (cached upstream). */
  async listToolkits(): Promise<IntegrationToolkit[]> {
    return (
      await this.r.json<{ items: IntegrationToolkit[] }>(
        `/v1/integrations/${COMPOSIO}/toolkits`,
      )
    ).items;
  }

  /** The acting user's connected accounts. */
  async listConnections(): Promise<IntegrationConnection[]> {
    return (
      await this.r.json<{ items: IntegrationConnection[] }>(
        `/v1/integrations/${COMPOSIO}/connections`,
      )
    ).items;
  }

  /** Poll one connection after {@link connect} until its OAuth finishes. */
  getConnection(connectionId: string): Promise<IntegrationConnection> {
    return this.r.json(
      `/v1/integrations/${COMPOSIO}/connections/${encodeURIComponent(connectionId)}`,
    );
  }

  /** Start an OAuth connect against one provider. The caller opens
   *  `redirectUrl`, then polls {@link getConnection} on `connectionId` until it
   *  is `active`. `provider` and `agent` are plain arguments, not an option
   *  bag, so the request this issues — path segment and body alike — is fixed
   *  by the signature. `agent` scopes the connection to one agent slug, which
   *  is what makes the gateway apply that agent's allowlist; omitted, it drops
   *  out of the body and the connection is the user's account-wide one. */
  connect(
    provider: IntegrationProviderId,
    toolkit: string,
    agent?: string,
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    return this.r.json(
      `/v1/integrations/${encodeURIComponent(provider)}/connect`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ toolkit, agent }),
      },
    );
  }

  /** Disconnect a toolkit for the user everywhere (removes its connections).
   *  `opts.provider` is additive; omitted keeps the legacy composio route.
   *  `opts.connectionId` narrows the removal to ONE account of the toolkit (a
   *  toolkit can hold several — two Gmail logins); omitted removes them all. */
  async disconnect(
    toolkit: string,
    opts?: { provider?: string; connectionId?: string },
  ): Promise<void> {
    const provider = opts?.provider ?? COMPOSIO;
    await this.r.request(
      `/v1/integrations/${encodeURIComponent(provider)}/disconnect`,
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          toolkit,
          ...(opts?.connectionId ? { connectionId: opts.connectionId } : {}),
        }),
      },
    );
  }

  /**
   * Push the caller's Supabase session token to the gateway adapter
   * (`PUT /v1/integrations/session`); `null` on sign-out. A deployment without a
   * session sink answers 404 — this method does NOT swallow it (errors
   * propagate); the CALLER decides whether a 404 is benign for its deployment.
   */
  async setSession(token: string | null): Promise<void> {
    await this.r.request("/v1/integrations/session", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    });
  }

  /**
   * Dismiss the one-time "reconnect your integrations" notice
   * (`POST /v1/integrations/reconnect-notice/dismiss`) — the host deletes the
   * retired legacy per-user credentials file. Idempotent host-side.
   */
  async dismissReconnectNotice(): Promise<void> {
    await this.r.request("/v1/integrations/reconnect-notice/dismiss", {
      method: "POST",
      headers: JSON_HEADERS,
    });
  }
}

/** Per-user preferences + the workspace-locale override (the boot/settings path). */
export class PreferencesClient {
  private readonly r: Requester;

  constructor(config: EngineClientConfig) {
    this.r = createRequester(config);
  }

  /** Read a preference value, or `null` when unset. */
  async getPreference(key: string): Promise<string | null> {
    return (
      await this.r.json<PreferenceValue>(
        `/v1/preferences/${encodeURIComponent(key)}`,
      )
    ).value;
  }

  /** Write (or, with `null`, clear) a preference; echoes the stored value. */
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

  /** Set (or clear, with `null`) the workspace's UI-locale override. */
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
