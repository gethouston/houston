import type {
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

const integrationPath = (provider: string) =>
  `/v1/integrations/${encodeURIComponent(provider)}`;

export async function integrationStatus(
  cfg: ControlPlaneConfig,
): Promise<IntegrationProviderStatus[]> {
  const res = await cpFetch(cfg, "/v1/integrations");
  return ((await res.json()) as { items: IntegrationProviderStatus[] }).items;
}

export async function setIntegrationSession(
  cfg: ControlPlaneConfig,
  token: string | null,
): Promise<void> {
  try {
    await cpFetch(cfg, "/v1/integrations/session", {
      method: "PUT",
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    // 404 = this deployment has no gateway session sink (the cloud host
    // verifies JWTs itself) — a legitimate shape, not a failure. Anything
    // else (network, 5xx) rethrows and the caller surfaces it.
    if (err instanceof HoustonEngineError && err.status === 404) return;
    throw err;
  }
}

export async function integrationConnection(
  cfg: ControlPlaneConfig,
  provider: string,
  connectionId: string,
): Promise<IntegrationConnection> {
  const res = await cpFetch(
    cfg,
    `${integrationPath(provider)}/connections/${encodeURIComponent(connectionId)}`,
  );
  return (await res.json()) as IntegrationConnection;
}

export async function integrationToolkits(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<IntegrationToolkit[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/toolkits`);
  return ((await res.json()) as { items: IntegrationToolkit[] }).items;
}

export async function integrationConnections(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<IntegrationConnection[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/connections`);
  return ((await res.json()) as { items: IntegrationConnection[] }).items;
}

export async function connectIntegration(
  cfg: ControlPlaneConfig,
  provider: string,
  toolkit: string,
  agent?: string,
): Promise<{ redirectUrl: string; connectionId: string }> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/connect`, {
    method: "POST",
    body: JSON.stringify({ toolkit, ...(agent ? { agent } : {}) }),
  });
  return (await res.json()) as { redirectUrl: string; connectionId: string };
}

export async function disconnectIntegration(
  cfg: ControlPlaneConfig,
  provider: string,
  toolkit: string,
): Promise<void> {
  await cpFetch(cfg, `${integrationPath(provider)}/disconnect`, {
    method: "POST",
    body: JSON.stringify({ toolkit }),
  });
}

export async function dismissIntegrationsReconnectNotice(
  cfg: ControlPlaneConfig,
): Promise<void> {
  await cpFetch(cfg, "/v1/integrations/reconnect-notice/dismiss", {
    method: "POST",
  });
}
