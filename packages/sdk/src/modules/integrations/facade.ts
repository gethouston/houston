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

export interface ConnectResult {
  redirectUrl: string;
  connectionId: string;
}

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

export interface IntegrationsModule {
  readonly scope: string;
  refresh(): Promise<IntegrationsViewModel>;
  connect(
    provider: IntegrationProviderId,
    toolkit: string,
    agent?: string,
  ): Promise<ConnectResult>;
  pollConnection(connectionId: string): Promise<IntegrationConnection>;
  disconnect(toolkit: string): Promise<IntegrationsViewModel>;
  setSession(token: string | null): Promise<void>;
  dismissReconnectNotice(): Promise<void>;
  writes: IntegrationsWrites;
  reads: ReturnType<typeof createIntegrationsReads>;
  custom: ReturnType<typeof createCustomIntegrations>;
  agentCustom: ReturnType<typeof createAgentCustomIntegrations>;
}
