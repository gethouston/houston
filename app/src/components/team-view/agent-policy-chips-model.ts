import type {
  Agent,
  AgentSettings,
  OrgMember,
} from "@houston-ai/engine-client";
import { isSharedWithEveryone } from "../agent/agent-access-model.ts";
import {
  type AgentRosterInput,
  agentPeopleCount,
} from "../agent-settings/agent-people-choice.ts";

export type PeoplePolicyChip =
  | { kind: "everyone" }
  | { kind: "count"; n: number };

export type CeilingPolicyChip =
  | { kind: "all" }
  | { kind: "count"; n: number }
  | { kind: "pending" };

export interface AgentPolicyChips {
  people: PeoplePolicyChip;
  integrations: CeilingPolicyChip;
  models: CeilingPolicyChip;
}

function ceiling(value: string[] | null | undefined): CeilingPolicyChip {
  if (value === undefined) return { kind: "pending" };
  return value === null ? { kind: "all" } : { kind: "count", n: value.length };
}

/**
 * The gateway-cheap policy summary an agent row can show WITHOUT waking its
 * pod: who may use it (roster math the share dialog already owns) and its two
 * ceilings (gateway-stored settings). Pod-owned facts (job description,
 * skills, learnings) are deliberately absent — a roster-wide read of those
 * wakes every cold pod.
 */
export function agentPolicyChips(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
  members: readonly OrgMember[],
  settings: AgentSettings | undefined,
): AgentPolicyChips {
  const roster: AgentRosterInput = { agent, members, selfId: null };
  return {
    people: isSharedWithEveryone(agent)
      ? { kind: "everyone" }
      : { kind: "count", n: agentPeopleCount(roster) },
    integrations: ceiling(settings?.allowedToolkits),
    models: ceiling(settings?.allowedModels),
  };
}
