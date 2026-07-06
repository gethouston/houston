/**
 * The user-scoped gateway surface: Composio integrations, per-agent integration
 * grants, key/value preferences, and the workspace-locale override. Unlike
 * {@link HoustonEngineClient} (rooted at ONE conversation / agent), these routes
 * are keyed by the caller's verified session `sub` and shared across the user's
 * agents — so they hit the gateway root (`/v1/...`), never `/agents/:id/*`.
 *
 * Both classes share the same {@link Requester} plumbing as the conversation
 * client (base-URL joining, bearer auth, non-2xx → {@link EngineError}), so
 * there is one way this package talks to the engine.
 */

import { createRequester, EngineError, type Requester } from "./requester";
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

/** Integrations + per-agent grants (C1/C4). All calls carry the session JWT. */
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

  /** Start an OAuth connect. The caller opens `redirectUrl`, then polls
   *  {@link getConnection} on `connectionId` until it is `active`. */
  connect(
    toolkit: string,
  ): Promise<{ redirectUrl: string; connectionId: string }> {
    return this.r.json(`/v1/integrations/${COMPOSIO}/connect`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ toolkit }),
    });
  }

  /** Disconnect a toolkit for the user everywhere (removes its connections). */
  async disconnect(toolkit: string): Promise<void> {
    await this.r.request(`/v1/integrations/${COMPOSIO}/disconnect`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ toolkit }),
    });
  }

  /**
   * The toolkit slugs granted to `agentSlug`, or `null` when the host does not
   * serve grants (404 — a deployment without per-agent grants). `null` means
   * "unsupported, show no per-agent toggles"; `[]` means "record exists, nothing
   * granted" — the two are DISTINCT. Every other error still throws.
   */
  async getIntegrationGrants(agentSlug: string): Promise<string[] | null> {
    try {
      return (
        await this.r.json<{ toolkits: string[] }>(
          `/v1/agents/${encodeURIComponent(agentSlug)}/integration-grants`,
        )
      ).toolkits;
    } catch (err) {
      if (err instanceof EngineError && err.status === 404) return null;
      throw err;
    }
  }

  /** Replace the toolkit slugs granted to `agentSlug` (a replace-set). */
  async putIntegrationGrants(
    agentSlug: string,
    toolkits: string[],
  ): Promise<void> {
    await this.r.request(
      `/v1/agents/${encodeURIComponent(agentSlug)}/integration-grants`,
      {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ toolkits }),
      },
    );
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
