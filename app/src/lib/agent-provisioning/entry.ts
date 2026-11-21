import type { ActivityStatus, MessageMention } from "@houston/engine-adapter";
import type { GrantableOperation } from "@houston/protocol";
import { queryKeys } from "../query-keys.ts";

export const PROVISIONING_TTL_MS = 10 * 60_000;

export interface PendingWarmingSend {
  id: string;
  sessionKey: string;
  text: string;
  prompt?: string;
  row?: {
    id: string;
    title: string;
    description: string;
    agent?: string;
    provider?: string;
    model?: string;
    status?: ActivityStatus;
  };
  rowOnly?: boolean;
  provider?: string;
  model?: string;
  effort?: string;
  mode?: "execute" | "plan" | "auto";
  mentions?: MessageMention[];
  grants?: GrantableOperation[];
  queuedAt?: number;
  titleText?: string;
}

export interface ProvisioningEntry {
  agentId: string;
  agentPath: string;
  since: number;
  reason?: "create" | "asleep";
  pendingSends?: PendingWarmingSend[];
  timedOut?: boolean;
}

export function warmingIsCreation(entry: ProvisioningEntry): boolean {
  return entry.reason !== "asleep";
}

const readsOpened = new WeakSet<ProvisioningEntry>();

export function openWarmingReads(entry: ProvisioningEntry): void {
  readsOpened.add(entry);
}

export function warmingReadsAnswerEmpty(entry: ProvisioningEntry): boolean {
  return warmingIsCreation(entry) && !readsOpened.has(entry);
}

export function warmingFlushRefetchKeys(
  agentPath: string,
): readonly (readonly unknown[])[] {
  return [
    queryKeys.allConversations([]),
    queryKeys.activity(agentPath),
    queryKeys.config(agentPath),
  ];
}
