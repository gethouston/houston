import type { IntegrationProviderId } from "@houston/protocol";
import { createRequester, type Requester } from "./requester";
import type {
  EngineClientConfig,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
} from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

const COMPOSIO: IntegrationProviderId = "composio";

export class IntegrationsClient {
  private readonly r: Requester;

  constructor(config: EngineClientConfig) {
    this.r = createRequester(config);
  }

  async listIntegrations(): Promise<IntegrationProviderStatus[]> {
    return (
      await this.r.json<{ items: IntegrationProviderStatus[] }>(
        "/v1/integrations",
      )
    ).items;
  }

  async listToolkits(): Promise<IntegrationToolkit[]> {
    return (
      await this.r.json<{ items: IntegrationToolkit[] }>(
        `/v1/integrations/${COMPOSIO}/toolkits`,
      )
    ).items;
  }

  async listConnections(): Promise<IntegrationConnection[]> {
    return (
      await this.r.json<{ items: IntegrationConnection[] }>(
        `/v1/integrations/${COMPOSIO}/connections`,
      )
    ).items;
  }

  getConnection(connectionId: string): Promise<IntegrationConnection> {
    return this.r.json(
      `/v1/integrations/${COMPOSIO}/connections/${encodeURIComponent(connectionId)}`,
    );
  }

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

  async disconnect(
    toolkit: string,
    opts?: { provider?: IntegrationProviderId; connectionId?: string },
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

  async setSession(token: string | null): Promise<void> {
    await this.r.request("/v1/integrations/session", {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
    });
  }

  async dismissReconnectNotice(): Promise<void> {
    await this.r.request("/v1/integrations/reconnect-notice/dismiss", {
      method: "POST",
      headers: JSON_HEADERS,
    });
  }
}
