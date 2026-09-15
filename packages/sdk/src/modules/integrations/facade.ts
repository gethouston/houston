/**
 * The typed integrations facade: the module's public shape, and the thin
 * namespaces that bind the request functions in `reads.ts`, `custom.ts` and
 * `custom-agent.ts` to one {@link HttpScope}.
 *
 * Every member here is a one-line delegation on purpose. The assistant catalog
 * derives an operation's route from the transport call in the declaration's OWN
 * body, so a facade member that forwards to an exported request function is not
 * an operation at all — the request function is, under its own name, which is
 * how one implementation serves both the typed surface and the catalog.
 */

import type { IntegrationProviderId } from "@houston/protocol";
import type { IntegrationConnection } from "@houston/runtime-client";
import type { HttpScope } from "../http";
import {
  addCustomIntegration,
  customIntegrations,
  customIntegrationTools,
  detectCustomIntegration,
  removeCustomIntegration,
  startCustomIntegrationOAuth,
  submitCustomIntegrationCredential,
  updateCustomIntegrationDetails,
} from "./custom";
import {
  addAgentCustomIntegration,
  agentCustomIntegrations,
  agentCustomIntegrationTools,
  detectAgentCustomIntegration,
  removeAgentCustomIntegration,
  startAgentCustomIntegrationOAuth,
  submitAgentCustomIntegrationCredential,
  updateAgentCustomIntegrationDetails,
} from "./custom-agent";
import {
  integrationConnection,
  integrationConnections,
  integrationStatus,
  integrationToolkits,
  triggerTypes,
} from "./reads";
import type { IntegrationsViewModel } from "./types";
import type { IntegrationsWrites } from "./writes";

/** The result of a connect: the URL the surface opens, plus the id to poll. */
export interface ConnectResult {
  redirectUrl: string;
  connectionId: string;
}

/** The provider-scoped reads, bound to one scope. */
export function createIntegrationsReads(scope: HttpScope) {
  return {
    status: () => integrationStatus(scope),
    toolkits: (provider: IntegrationProviderId) =>
      integrationToolkits(scope, provider),
    connections: (provider: IntegrationProviderId) =>
      integrationConnections(scope, provider),
    connection: (provider: IntegrationProviderId, connectionId: string) =>
      integrationConnection(scope, provider, connectionId),
    triggerTypes: (toolkit: string) => triggerTypes(scope, toolkit),
  };
}

/** The user-scoped custom-connector surface, bound to one scope. */
export function createCustomIntegrations(scope: HttpScope) {
  return {
    list: () => customIntegrations(scope),
    tools: (slug: string) => customIntegrationTools(scope, slug),
    detect: (url: string) => detectCustomIntegration(scope, url),
    add: (input: Parameters<typeof addCustomIntegration>[1]) =>
      addCustomIntegration(scope, input),
    remove: (slug: string) => removeCustomIntegration(scope, slug),
    updateDetails: (
      slug: string,
      details: Parameters<typeof updateCustomIntegrationDetails>[2],
    ) => updateCustomIntegrationDetails(scope, slug, details),
    submitCredential: (slug: string, values: Record<string, string>) =>
      submitCustomIntegrationCredential(scope, slug, values),
    startOAuth: (slug: string) => startCustomIntegrationOAuth(scope, slug),
  };
}

/** The per-agent custom-connector surface, bound to one scope. */
export function createAgentCustomIntegrations(scope: HttpScope) {
  return {
    list: (agentSlugOrId: string) =>
      agentCustomIntegrations(scope, agentSlugOrId),
    tools: (agentSlugOrId: string, slug: string) =>
      agentCustomIntegrationTools(scope, agentSlugOrId, slug),
    detect: (agentSlugOrId: string, url: string) =>
      detectAgentCustomIntegration(scope, agentSlugOrId, url),
    add: (
      agentSlugOrId: string,
      input: Parameters<typeof addAgentCustomIntegration>[2],
    ) => addAgentCustomIntegration(scope, agentSlugOrId, input),
    remove: (agentSlugOrId: string, slug: string) =>
      removeAgentCustomIntegration(scope, agentSlugOrId, slug),
    updateDetails: (
      agentSlugOrId: string,
      slug: string,
      details: Parameters<typeof updateAgentCustomIntegrationDetails>[3],
    ) =>
      updateAgentCustomIntegrationDetails(scope, agentSlugOrId, slug, details),
    submitCredential: (
      agentSlugOrId: string,
      slug: string,
      values: Record<string, string>,
    ) =>
      submitAgentCustomIntegrationCredential(
        scope,
        agentSlugOrId,
        slug,
        values,
      ),
    startOAuth: (agentSlugOrId: string, slug: string) =>
      startAgentCustomIntegrationOAuth(scope, agentSlugOrId, slug),
  };
}

/** The typed facade for integration reads + writes. */
export interface IntegrationsModule {
  /** Scope string for `sdk.subscribe(...)` / `sdk.getSnapshot(...)`. */
  readonly scope: string;
  /** Refetch readiness + catalog + connections and republish the VM. */
  refresh(): Promise<IntegrationsViewModel>;
  /** Start an OAuth connect (composio); the surface opens `redirectUrl`, then polls. */
  connect(toolkit: string): Promise<ConnectResult>;
  /** Provider-scoped connect (additive): `agent` scopes it to one agent slug. */
  connect(
    provider: string,
    toolkit: string,
    agent?: string,
  ): Promise<ConnectResult>;
  /** Poll one connection until its OAuth finishes (status flips to active). */
  pollConnection(connectionId: string): Promise<IntegrationConnection>;
  /** Disconnect a toolkit everywhere, then refetch the VM. */
  disconnect(toolkit: string): Promise<IntegrationsViewModel>;
  /** Push the caller's Supabase token to the gateway adapter (`null` on sign-out). */
  setSession(token: string | null): Promise<void>;
  /** Dismiss the one-time "reconnect your integrations" notice (idempotent). */
  dismissReconnectNotice(): Promise<void>;
  /** No-refetch write variants for a host that owns its own reads (web under
   *  `reactivity:false`). The refetching methods above are untouched (iOS-safe). */
  writes: IntegrationsWrites;
  /** The provider-scoped gateway reads (`/v1/integrations/{provider}/…`). */
  reads: ReturnType<typeof createIntegrationsReads>;
  /** The user's own added connectors (`/v1/integrations/custom/…`). */
  custom: ReturnType<typeof createCustomIntegrations>;
  /** The same connectors through one agent's pod — the form a hosted
   *  deployment serves (`/agents/{agentSlugOrId}/integrations/custom/…`). */
  agentCustom: ReturnType<typeof createAgentCustomIntegrations>;
}
