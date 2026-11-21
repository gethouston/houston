import type { Phase } from "./types";

export const GROUP_PHASES = {
  meta: "public",
  catalog: "public",
  "upload-sink": "public",
  "sandbox-credential": "sandbox",
  "sandbox-credential-revoked": "sandbox",
  "sandbox-provider-usage": "sandbox",
  "sandbox-integrations": "sandbox",
  "sandbox-custom-integrations": "sandbox",
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
  "migration-source": "user",
  "agent-configs": "user",
  "custom-integrations": "user",
  integrations: "user",
  "setup-runtime": "user",
  assistant: "user",
  heartbeat: "user",
  "trigger-events": "user",
  "routine-fires": "user",
  "agent-color": "user",
  "agent-delegation": "user",
  agents: "user",
  "agent-crud": "agent",
  "agent-credentials": "agent",
  "routine-runs": "agent",
  "agent-first-day": "agent",
  "agent-activity": "agent",
  "agent-approvals": "agent",
  "agent-integrations": "agent",
  "agent-missions": "agent",
  "agent-data": "agent",
  "trigger-status": "agent",
  "agent-file": "agent",
  "skills-manifest": "agent",
  skills: "agent",
  "workspace-files": "agent",
  attachments: "agent",
  uploads: "agent",
  "portable-preview": "agent",
  "portable-export": "agent",
  migration: "agent",
  "agent-proxy": "agent",
} as const satisfies Record<string, Phase>;

export type GroupId = keyof typeof GROUP_PHASES;

const isGroupId = (key: string): key is GroupId => key in GROUP_PHASES;

export const GROUP_ORDER: GroupId[] =
  Object.keys(GROUP_PHASES).filter(isGroupId);

export type GroupsIn<P extends Phase> = {
  [K in GroupId]: (typeof GROUP_PHASES)[K] extends P ? K : never;
}[GroupId];

const isPreAuth = (group: GroupId): group is GroupsIn<"public" | "sandbox"> =>
  GROUP_PHASES[group] === "public" || GROUP_PHASES[group] === "sandbox";

const isUser = (group: GroupId): group is GroupsIn<"user"> =>
  GROUP_PHASES[group] === "user";

const isAgent = (group: GroupId): group is GroupsIn<"agent"> =>
  GROUP_PHASES[group] === "agent";

export const PRE_AUTH_GROUPS = GROUP_ORDER.filter(isPreAuth);
export const USER_GROUPS = GROUP_ORDER.filter(isUser);
export const AGENT_GROUPS = GROUP_ORDER.filter(isAgent);
