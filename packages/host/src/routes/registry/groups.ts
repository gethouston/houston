import type { Phase } from "./types";

/**
 * Every dispatch group, in the order server.ts calls its slot, with the phase
 * that slot sits in. THIS TABLE IS THE CHAIN: server.ts walks it segment by
 * segment (server-phases.ts), so a group's position here is the position its
 * requests are matched at, and moving a line moves the route.
 *
 * The phases run public+sandbox → user → agent, and each phase's groups form
 * ONE contiguous run — registry/order.test.ts holds that shape, because the
 * segments are what the walk is built from.
 */
export const GROUP_PHASES = {
  // Health + the v3 meta surface: capabilities are not secrets, and the UI
  // reads them before sign-in to shape itself.
  meta: "public",
  // pi-ai's full static model catalog, the SAME on every deployment — static
  // and not user-scoped, so it rides the public meta surface.
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
  "sandbox-assistant": "sandbox",
  "sandbox-transcripts": "sandbox",
  events: "user",
  "pod-activity": "user",
  metrics: "user",
  feedback: "user",
  "shared-skills": "user",
  account: "user",
  "portable-account": "user",
  // Desktop-local by design: the cloud gateway proxies only agent-scoped
  // routes, so a managed pod never serves this listing.
  "migration-source": "user",
  "agent-configs": "user",
  // Custom-integration definitions BEFORE the generic provider family: the
  // `integrations` group claims the whole `/v1/integrations` subtree, so this
  // slot is what keeps `custom/*` reachable at all.
  "custom-integrations": "user",
  integrations: "user",
  "setup-runtime": "user",
  assistant: "user",
  // Control-plane delivery into a managed pod, ahead of the per-agent
  // dispatch because the agent's own runtime has no trigger or cron route.
  "trigger-events": "user",
  "routine-fires": "user",
  // Agent-scoped, yet a USER-phase group: it is mounted ahead of the per-agent
  // dispatch and answers its blanket 405 before any ownership check, so it
  // keeps the authz call inside its handler rather than taking the agent
  // phase's (which would answer 403 to a wrong method on someone else's agent).
  "agent-color": "user",
  // The user's own agents, then everything scoped to ONE of them. Every group
  // below is agent-phase: the dispatcher runs the ownership check for the agent
  // the matched pattern names, so none of them can answer without one.
  agents: "user",
  "agent-crud": "agent",
  "agent-credentials": "agent",
  "routine-runs": "agent",
  "agent-first-day": "agent",
  "agent-activity": "agent",
  "agent-approvals": "agent",
  // The custom-integration grammar on the PER-AGENT dispatch surface — the one
  // form the hosted gateway proxies to a pod. It declines a target its grammar
  // does not know, so the agent's own engine still answers for everything else
  // under `integrations/`.
  "agent-integrations": "agent",
  "agent-missions": "agent",
  "agent-data": "agent",
  "trigger-status": "agent",
  "agent-file": "agent",
  "skills-manifest": "agent",
  skills: "agent",
  "workspace-files": "agent",
  attachments: "agent",
  "portable-preview": "agent",
  "portable-export": "agent",
  migration: "agent",
  // LAST, and deliberately: it claims every remaining `/agents/:agentId/…`
  // path for the agent's own engine, so anything the host serves itself has to
  // be declared above it.
  "agent-proxy": "agent",
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

const isPreAuth = (group: GroupId): group is GroupsIn<"public" | "sandbox"> =>
  GROUP_PHASES[group] === "public" || GROUP_PHASES[group] === "sandbox";

const isUser = (group: GroupId): group is GroupsIn<"user"> =>
  GROUP_PHASES[group] === "user";

const isAgent = (group: GroupId): group is GroupsIn<"agent"> =>
  GROUP_PHASES[group] === "agent";

/**
 * The chain's three segments, in chain order — what server-phases.ts walks.
 *
 * Public and sandbox share one segment because they share one entry context:
 * both run before the 401 wall, and the public OAuth callback sits among the
 * sandbox families precisely because the browser arriving on it holds no
 * bearer token either.
 */
export const PRE_AUTH_GROUPS = GROUP_ORDER.filter(isPreAuth);
export const USER_GROUPS = GROUP_ORDER.filter(isUser);
export const AGENT_GROUPS = GROUP_ORDER.filter(isAgent);
