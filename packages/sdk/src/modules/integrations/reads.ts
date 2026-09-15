/**
 * The provider-scoped integration READS, plus the trigger catalog.
 *
 * The gateway keys these routes on a provider segment — composio for the app
 * catalogue, custom for the user's own connectors — so a caller that asks for
 * ONE provider comes through here and the path literal names `{provider}`
 * exactly as the route does. The reactive facade's own reads fold three
 * composio requests into one view-model and stay on
 * {@link IntegrationsClient}, which welds `composio` into the path.
 *
 * Assistant catalog: this file is the single source of truth for these five
 * operations, so each carries its own `@assistant` block.
 */

import type { IntegrationProviderId } from "@houston/protocol";
import type {
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
} from "@houston/runtime-client";
import { type HttpScope, httpRequest } from "../http";

/**
 * One entry in a toolkit's trigger catalog (C9), from
 * `GET /v1/integrations/composio/trigger-types?toolkit=<slug>`: an event a
 * routine can wake on. `type` splits latency classes — `webhook` is
 * near-realtime, `poll` carries minutes of inherent delay (surfaced in UI copy).
 * `config` is the JSON schema for the instance filters the user fills in (e.g.
 * GitHub's owner/repo); `payload` (when present) is the JSON schema of the event
 * body Composio delivers. Both are opaque schemas the client never interprets.
 */
export interface TriggerType {
  slug: string;
  name: string;
  description?: string;
  type: "poll" | "webhook";
  config: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

/**
 * Shows which outside apps can be connected and which ones already are.
 * @assistant group:integrations
 */
export async function integrationStatus(
  scope: HttpScope,
): Promise<IntegrationProviderStatus[]> {
  const res = await httpRequest(scope, "/v1/integrations");
  return ((await res.json()) as { items: IntegrationProviderStatus[] }).items;
}

/**
 * Checks whether a connection to an outside app has finished.
 * @param provider Which integration surface to ask: composio for the app
 *   catalogue, custom for the user's own connectors.
 * @param connectionId The connection to check, by the id
 *   integrationConnections returns.
 * @assistant group:integrations
 */
export async function integrationConnection(
  scope: HttpScope,
  provider: IntegrationProviderId,
  connectionId: string,
): Promise<IntegrationConnection> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/${encodeURIComponent(provider)}/connections/${encodeURIComponent(connectionId)}`,
  );
  return (await res.json()) as IntegrationConnection;
}

/**
 * Lists the outside apps available to connect.
 * @param provider Which integration surface to ask: composio for the app
 *   catalogue, custom for the user's own connectors.
 * @assistant group:integrations
 */
export async function integrationToolkits(
  scope: HttpScope,
  provider: IntegrationProviderId,
): Promise<IntegrationToolkit[]> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/${encodeURIComponent(provider)}/toolkits`,
  );
  return ((await res.json()) as { items: IntegrationToolkit[] }).items;
}

/**
 * Lists the accounts the user has connected for one outside app.
 * @param provider Which integration surface to ask: composio for the app
 *   catalogue, custom for the user's own connectors.
 * @assistant group:integrations
 */
export async function integrationConnections(
  scope: HttpScope,
  provider: IntegrationProviderId,
): Promise<IntegrationConnection[]> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/${encodeURIComponent(provider)}/connections`,
  );
  return ((await res.json()) as { items: IntegrationConnection[] }).items;
}

// ---- triggers (C9 event-driven routines) ----
// The trigger catalog the routine editor's picker reads — the events a routine
// can wake on for one toolkit. Read-only, served by the cloud edge; the
// per-routine provisioning status lives in `agentTriggerStatus`.

/**
 * Lists the events from an outside app that a routine can wake up on.
 * @param toolkit The outside app's toolkit slug, exactly as
 *   integrationToolkits returned it.
 * @assistant group:integrations
 * @assistant unschematized: a trigger type's config and payload are the outside app's own shapes.
 */
export async function triggerTypes(
  scope: HttpScope,
  toolkit: string,
): Promise<TriggerType[]> {
  const res = await httpRequest(
    scope,
    `/v1/integrations/composio/trigger-types?toolkit=${encodeURIComponent(toolkit)}`,
  );
  return ((await res.json()) as { items: TriggerType[] }).items;
}
