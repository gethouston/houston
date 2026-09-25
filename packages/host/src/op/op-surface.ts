import { AGENT_GROUPS, type GroupsIn } from "../routes/registry/groups";

/**
 * The per-agent groups a pool worker does NOT answer, each with why it cannot.
 * Everything else in the registry's agent segment is served here — the Record
 * below has no key to hold a new group's handler until one is written, so the
 * pod and the worker cannot drift apart silently.
 */
export const OP_EXCLUSIONS = {
  "agent-crud":
    "renaming and deleting an agent is a write to the registry the gateway owns; it never reaches a pod or a worker",
  "agent-first-day":
    "starting a first day fires the setup task's first turn, which a file-only worker cannot do",
  "agent-credentials":
    "credential writes ride their own op kinds against the gateway's secret store — a worker's hydrated tree holds no vault",
  "routine-runs":
    "firing or cancelling a run starts a turn, so it is the gateway's own pooled run-now op rather than a route",
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

/** A per-agent group a pool worker serves — every one the table does not excuse. */
export type OpGroup = Exclude<GroupsIn<"agent">, keyof typeof OP_EXCLUSIONS>;

/** The served groups in the registry's own chain order. */
export const OP_CHAIN = AGENT_GROUPS.filter(
  (group): group is OpGroup => !(group in OP_EXCLUSIONS),
);
