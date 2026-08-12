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
  | { kind: "pending" }
  | { kind: "unavailable" };

export interface AgentPolicyChips {
  people: PeoplePolicyChip;
  integrations: CeilingPolicyChip;
  models: CeilingPolicyChip;
}

/** One agent's settings read, exactly as the roster fan-out reports it. */
export interface AgentSettingsRead {
  /** The settings, `undefined` while the read is in flight or has failed. */
  data: AgentSettings | undefined;
  /** The read's error, `undefined`/`null` while it is in flight or answered. */
  error?: unknown;
}

/**
 * A row shows what it HAS, says so when it has nothing, and stays blank only
 * while it is still waiting: a value we already hold survives a failed refresh,
 * and a read that failed with nothing to show is never dressed up as a read
 * still on its way.
 */
function ceiling(
  value: string[] | null | undefined,
  error: unknown,
): CeilingPolicyChip {
  if (value === undefined)
    return error == null ? { kind: "pending" } : { kind: "unavailable" };
  return value === null ? { kind: "all" } : { kind: "count", n: value.length };
}

/**
 * The gateway-cheap policy summary an agent row can show WITHOUT waking its
 * pod: who may use it (roster math the share dialog already owns) and its two
 * ceilings (gateway-stored settings). Pod-owned facts (job description,
 * skills, learnings) are deliberately absent — a roster-wide read of those
 * wakes every cold pod.
 *
 * The ceilings carry the READ's outcome, not just its payload, so a row whose
 * settings never arrived can say so instead of sitting blank forever behind the
 * face of one still loading.
 */
export function agentPolicyChips(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
  members: readonly OrgMember[],
  read: AgentSettingsRead,
): AgentPolicyChips {
  const roster: AgentRosterInput = { agent, members, selfId: null };
  return {
    people: isSharedWithEveryone(agent)
      ? { kind: "everyone" }
      : { kind: "count", n: agentPeopleCount(roster) },
    integrations: ceiling(read.data?.allowedToolkits, read.error),
    models: ceiling(read.data?.allowedModels, read.error),
  };
}
