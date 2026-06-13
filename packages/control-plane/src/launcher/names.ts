import type { Agent, AgentId } from "../domain/types";
import { config } from "../config";

/**
 * Deterministic K8s object names derived from tenancy ids. One agent maps to
 * exactly one Deployment, one Service, and one PVC inside its workspace's
 * namespace, so every name is a pure function of (workspaceSlug, agentId) — no
 * lookups, no collisions across workspaces.
 */

const ENGINE_PORT = 4317;

/** Label key + value stamped on every object the control plane creates. The admin
 *  cluster reader selects on this to find exactly Houston's agent pods. */
export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by";
export const MANAGED_BY_VALUE = "houston-control-plane";
/** The label keys carrying tenancy ids, read back to attribute a pod to its agent/workspace. */
export const WORKSPACE_LABEL = "houston.ai/workspace";
export const AGENT_LABEL = "houston.ai/agent";

/** DNS-1123 label: lowercase alphanumerics and '-', max 63 chars, no leading/trailing '-'. */
function dnsLabel(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const trimmed = cleaned.slice(0, 63).replace(/-+$/g, "");
  if (!trimmed) throw new Error(`cannot derive a DNS label from ${JSON.stringify(raw)}`);
  return trimmed;
}

/** Workspace namespace, e.g. "ws-acme-corp". The workspace slug is already DNS-safe. */
export function namespaceFor(workspaceSlug: string): string {
  return dnsLabel(`${config.namespacePrefix}${workspaceSlug}`);
}

/** Per-agent object base name, e.g. "agent-7f3c". Shared by Deployment/Service/PVC. */
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

/** Port the agent's engine listens on inside the pod / service. */
export const enginePort = ENGINE_PORT;

/** In-cluster DNS the control plane uses to reach an awake sandbox. */
export function serviceBaseUrl(agent: Agent, workspaceSlug: string): string {
  const ns = namespaceFor(workspaceSlug);
  return `http://${serviceName(agent.id)}.${ns}.svc.cluster.local:${ENGINE_PORT}`;
}

/** Labels stamped on every object so a whole agent can be selected at once. */
export function agentLabels(agent: Agent): Record<string, string> {
  return {
    [MANAGED_BY_LABEL]: MANAGED_BY_VALUE,
    [WORKSPACE_LABEL]: agent.workspaceId,
    [AGENT_LABEL]: agent.id,
  };
}
