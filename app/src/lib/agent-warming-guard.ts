import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { useUIStore } from "../stores/ui";
import { warmingReadsAnswerEmpty } from "./agent-provisioning/entry";
import {
  AGENT_WARMING_ERROR_NAME,
  isAgentWarmingRefusal,
} from "./agent-warming-refusal";
import i18n from "./i18n";

export interface WarmingWriteOptions {
  allowWhileWarming?: boolean;
}

export class AgentWarmingError extends Error {
  constructor() {
    super(i18n.t("shell:agentProvisioning.blockedBody"));
    this.name = AGENT_WARMING_ERROR_NAME;
  }
}

export function isAgentWarmingError(e: unknown): boolean {
  return isAgentWarmingRefusal(e);
}

export function isAgentPathWarming(agentPath: string): boolean {
  const entries = useAgentProvisioningStore.getState().provisioning;
  for (const entry of Object.values(entries)) {
    if (entry.agentPath === agentPath) return true;
  }
  return false;
}

export function isAgentPathCreating(agentPath: string): boolean {
  const entries = useAgentProvisioningStore.getState().provisioning;
  for (const entry of Object.values(entries)) {
    if (entry.agentPath === agentPath) return warmingReadsAnswerEmpty(entry);
  }
  return false;
}

export function blockWriteWhileWarming(agentPath: string): void {
  if (!isAgentPathWarming(agentPath)) return;
  useUIStore.getState().setAgentWarmingNoticeOpen(true);
  throw new AgentWarmingError();
}

export function blockWriteWhileWarmingById(agentId: string): void {
  if (!useAgentProvisioningStore.getState().provisioning[agentId]) return;
  useUIStore.getState().setAgentWarmingNoticeOpen(true);
  throw new AgentWarmingError();
}
