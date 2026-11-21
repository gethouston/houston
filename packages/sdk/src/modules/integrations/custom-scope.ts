import type { Capabilities, CustomIntegrationScope } from "@houston/protocol";

export function customIntegrationScope(
  capabilities: Pick<Capabilities, "customIntegrationScope"> | null,
): CustomIntegrationScope {
  return capabilities?.customIntegrationScope ?? "host";
}

export interface CustomTransportChoice {
  scope: CustomIntegrationScope;
  agentIds: readonly string[];
  setupAgentId: string | null;
  pickedAgentId: string | null;
  currentAgentId: string | null;
}

export function resolveCustomTransportAgent(
  choice: CustomTransportChoice,
): string | undefined {
  const { agentIds } = choice;
  if (choice.scope === "host") return agentIds[0];
  const known = (id: string | null) =>
    id !== null && agentIds.includes(id) ? id : undefined;
  return (
    known(choice.setupAgentId) ??
    known(choice.pickedAgentId) ??
    known(choice.currentAgentId) ??
    agentIds[0]
  );
}
