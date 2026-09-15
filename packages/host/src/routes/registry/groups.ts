import type { Phase } from "./types";

/**
 * Every dispatch group, in the order server.ts calls its slot, with the phase
 * that slot sits in. A migration wave appends its groups HERE and replaces its
 * handler's chain slot with one `dispatchGroup` line, so a group occupies
 * exactly the position its handler did and global order cannot move.
 */
export const GROUP_PHASES = {
  meta: "public",
  catalog: "public",
  "sandbox-credential": "sandbox",
  "sandbox-credential-revoked": "sandbox",
  "sandbox-provider-usage": "sandbox",
  "sandbox-integrations": "sandbox",
  "sandbox-custom-integrations": "sandbox",
  // Public (no bearer at all), yet mounted here: its single-use `state` is the
  // whole authentication, so it answers from the same slot the sandbox
  // families do — before the 401 wall the browser could never satisfy.
  "custom-oauth-callback": "public",
  "sandbox-routines": "sandbox",
  "sandbox-learnings": "sandbox",
  "sandbox-missions": "sandbox",
  "sandbox-skills": "sandbox",
  "sandbox-assistant": "sandbox",
  "sandbox-transcripts": "sandbox",
  events: "user",
  "pod-activity": "user",
  metrics: "user",
  feedback: "user",
  "skills-directory": "user",
  "shared-skills": "user",
  account: "user",
  "portable-account": "user",
  "portable-from-store": "user",
  "migration-source": "user",
  "agent-configs": "user",
  // Custom-integration definitions BEFORE the generic provider family: the
  // `integrations` group claims the whole `/v1/integrations` subtree, so this
  // slot is what keeps `custom/*` reachable at all.
  "custom-integrations": "user",
  integrations: "user",
  "setup-runtime": "user",
  assistant: "user",
  "trigger-events": "user",
  "routine-fires": "user",
  // Agent-scoped, yet a USER-phase group: it is mounted ahead of the per-agent
  // dispatch and answers its blanket 405 before any ownership check, so it
  // keeps the authz call inside its handler rather than taking the agent
  // phase's (which would answer 403 to a wrong method on someone else's agent).
  "agent-color": "user",
  "routine-runs": "agent",
  "agent-activity": "agent",
  "agent-approvals": "agent",
  "agent-missions": "agent",
  "agent-data": "agent",
  "trigger-status": "agent",
  "agent-file": "agent",
  "skills-manifest": "agent",
  skills: "agent",
  "skills-remote": "agent",
  "workspace-files": "agent",
  attachments: "agent",
  "portable-preview": "agent",
  "portable-anonymize": "agent",
  "portable-export": "agent",
  migration: "agent",
  "portable-store": "agent",
} as const satisfies Record<string, Phase>;

export type GroupId = keyof typeof GROUP_PHASES;

const isGroupId = (key: string): key is GroupId => key in GROUP_PHASES;

/** The groups in chain order — the order server.ts calls their slots. */
export const GROUP_ORDER: GroupId[] =
  Object.keys(GROUP_PHASES).filter(isGroupId);

/** Every group whose slot sits in one of the given phases. */
export type GroupsIn<P extends Phase> = {
  [K in GroupId]: (typeof GROUP_PHASES)[K] extends P ? K : never;
}[GroupId];
