import { AGENT_GROUPS, type GroupsIn } from "../routes/registry/groups";

export const OP_EXCLUSIONS = {
  uploads:
    "the gateway opens upload sessions before dispatch; workers only commit staged uploads",
  "agent-crud":
    "renaming and deleting an agent is a write to the registry the gateway owns; it never reaches a pod or a worker",
  "agent-first-day":
    "starting a first day fires the setup task's first turn, which a file-only worker cannot do",
  "agent-credentials":
    "credential writes ride their own op kinds against the gateway's secret store — a worker's hydrated tree holds no vault",
  "agent-activity":
    "the busy probe asks the runtime channel about a live pod, and a worker has no pod to answer for",
  "agent-approvals":
    "a pending approval lives in the running host's memory, so only the process holding the turn can read it back",
  "agent-missions":
    "starting or moving a mission runs the agent's first turn, which a file-only worker cannot do",
  "trigger-status":
    "gateway-native while the agent sleeps: the trigger registry is the control plane's, not the agent's tree",
  "agent-proxy":
    "the forward to the agent's own engine is what an op REPLACES; a worker that proxied would wake the pod it exists to spare",
} as const satisfies Partial<Record<GroupsIn<"agent">, string>>;

export type OpGroup = Exclude<GroupsIn<"agent">, keyof typeof OP_EXCLUSIONS>;

export const OP_CHAIN = AGENT_GROUPS.filter(
  (group): group is OpGroup => !(group in OP_EXCLUSIONS),
);
