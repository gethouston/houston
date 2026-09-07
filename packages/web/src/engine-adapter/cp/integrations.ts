import type {
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  TriggerType,
} from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

// The integration WRITES — connect / disconnect / session / reconnect-notice
// dismiss — delegate to `sdk.integrations.*` (byte-identical routes, no
// refetch); see `client/integrations-mixin.ts`. Only the READS stay here.

const integrationPath = (provider: string) =>
  `/v1/integrations/${encodeURIComponent(provider)}`;

/**
 * Shows which outside apps can be connected and which ones already are.
 * @assistant group:integrations
 */
export async function integrationStatus(
  cfg: ControlPlaneConfig,
): Promise<IntegrationProviderStatus[]> {
  const res = await cpFetch(cfg, "/v1/integrations");
  return ((await res.json()) as { items: IntegrationProviderStatus[] }).items;
}

/**
 * Checks whether a connection to an outside app has finished.
 * @assistant group:integrations
 */
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

/**
 * Lists the outside apps available to connect.
 * @assistant group:integrations
 */
export async function integrationToolkits(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<IntegrationToolkit[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/toolkits`);
  return ((await res.json()) as { items: IntegrationToolkit[] }).items;
}

/**
 * Lists the accounts the user has connected for one outside app.
 * @assistant group:integrations
 */
export async function integrationConnections(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<IntegrationConnection[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/connections`);
  return ((await res.json()) as { items: IntegrationConnection[] }).items;
}

// ---- triggers (C9 event-driven routines) ----
// The trigger catalog the routine editor's picker reads — the events a routine
// can wake on for one toolkit. Read-only, served by the cloud edge; the
// per-routine provisioning status lives in `agentTriggerStatus`
// (cp/agent-teams.ts).

/**
 * Lists the events from an outside app that a routine can wake up on.
 * @assistant group:integrations
 */
export async function triggerTypes(
  cfg: ControlPlaneConfig,
  toolkit: string,
): Promise<TriggerType[]> {
  const res = await cpFetch(
    cfg,
    `/v1/integrations/composio/trigger-types?toolkit=${encodeURIComponent(toolkit)}`,
  );
  return ((await res.json()) as { items: TriggerType[] }).items;
}
