import { config } from "../config";
import type { Agent, AgentId } from "../domain/types";

const ENGINE_PORT = 4317;

export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by";
export const MANAGED_BY_VALUE = "houston-control-plane";
export const WORKSPACE_LABEL = "houston.ai/workspace";
export const AGENT_LABEL = "houston.ai/agent";

function dnsLabel(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const trimmed = cleaned.slice(0, 63).replace(/-+$/g, "");
  if (!trimmed)
    throw new Error(`cannot derive a DNS label from ${JSON.stringify(raw)}`);
  return trimmed;
}

export function namespaceFor(workspaceSlug: string): string {
  return dnsLabel(`${config.namespacePrefix}${workspaceSlug}`);
}

export function agentResourceName(agentId: AgentId): string {
  return dnsLabel(`agent-${agentId}`);
}

export function deploymentName(agentId: AgentId): string {
  return agentResourceName(agentId);
}

export function serviceName(agentId: AgentId): string {
  return agentResourceName(agentId);
}

export function pvcName(agentId: AgentId): string {
  return `${agentResourceName(agentId)}-data`;
}

export const enginePort = ENGINE_PORT;

export function serviceBaseUrl(agent: Agent, workspaceSlug: string): string {
  const ns = namespaceFor(workspaceSlug);
  return `http://${serviceName(agent.id)}.${ns}.svc.cluster.local:${ENGINE_PORT}`;
}

export function agentLabels(agent: Agent): Record<string, string> {
  return {
    [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
    [WORKSPACE_LABEL]: agent.workspaceId,
    [AGENT_LABEL]: agent.id,
  };
}
