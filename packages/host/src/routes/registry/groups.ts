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
  events: "user",
  "pod-activity": "user",
  metrics: "user",
  feedback: "user",
  "agent-activity": "agent",
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
