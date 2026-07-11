import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
} from "../../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

// The integration WRITES — connect / disconnect / session / reconnect-notice
// dismiss — delegate to `sdk.integrations.*` (byte-identical routes, no
// refetch); see `client/integrations-mixin.ts`. Only the READS stay here.

const integrationPath = (provider: string) =>
  `/v1/integrations/${encodeURIComponent(provider)}`;

export async function integrationStatus(
  cfg: ControlPlaneConfig,
): Promise<IntegrationProviderStatus[]> {
  const res = await cpFetch(cfg, "/v1/integrations");
  return ((await res.json()) as { items: IntegrationProviderStatus[] }).items;
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

// ---- custom integrations (HOU-550): user-defined API / MCP servers ----
// A deployment without the custom-integrations surface (older host) answers
// 404 on the definitions read; that is a legitimate "feature absent" shape, so
// it maps to null (the section stays hidden) rather than surfacing an error.
// The write routes have no such fallback — a failure there is a real failure.

export async function customIntegrations(
  cfg: ControlPlaneConfig,
): Promise<CustomIntegrationView[] | null> {
  try {
    const res = await cpFetch(cfg, "/v1/integrations/custom/definitions");
    return ((await res.json()) as { items: CustomIntegrationView[] }).items;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

export async function removeCustomIntegration(
  cfg: ControlPlaneConfig,
  slug: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

export async function submitCustomIntegrationCredential(
  cfg: ControlPlaneConfig,
  slug: string,
  values: Record<string, string>,
): Promise<CustomIntegrationView> {
  const res = await cpFetch(
    cfg,
    `/v1/integrations/custom/definitions/${encodeURIComponent(slug)}/credential`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
  return (await res.json()) as CustomIntegrationView;
}
