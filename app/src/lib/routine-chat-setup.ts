/**
 * The setup chat behind every automation — its persistent conversation, the
 * whole tab screen while open (HOU-725, first-principles rebuild). Each item
 * gets exactly one: creating it starts the chat, and reopening it resumes the
 * very same conversation.
 *
 * One kind of chat serves both wake mechanisms (schedule and event trigger) —
 * the merged Automations tab replaced the old Routines/Reactions split. New
 * chats carry `ROUTINE_SETUP_AGENT_MODE`; the legacy reaction sentinel is
 * still RECOGNIZED (never written) so chats created before the merge keep
 * resolving. Board surfaces hide both via `isRoutineSetupMode`; the kickoff
 * prompts live in `routine-chat-prompts.ts`. This module owns the sentinels
 * and the chat <-> item link resolution.
 *
 * The chat <-> item link is stored in both directions — the item's
 * `setup_activity_id` (written by the agent on chat-created items, by the
 * client otherwise) and the activity's `routine_id` (client-stamped, durable
 * because agents never rewrite activity.json). See the resolution helpers below
 * for why one direction is not enough.
 */

/**
 * Sentinel stored in the activity's `agent` (mode) field so every mission
 * surface can recognize a setup chat. Namespaced with `houston:` so it can
 * never collide with a user-defined agent-mode id, and reusing the existing
 * field means no schema change and the value already flows through the
 * conversation adapters (HOU-665 keeps `agent` alive end to end).
 */
export const ROUTINE_SETUP_AGENT_MODE = "houston:routine-setup";
/** Legacy sentinel from the pre-merge Reactions tab — user data on disk still
 *  carries it, so it is recognized forever; nothing writes it anymore. */
export const REACTION_SETUP_AGENT_MODE = "houston:reaction-setup";

/**
 * True when an activity's `agent` (mode) marks it as a setup chat (current or
 * legacy sentinel). Board/mission surfaces use this to hide them — a setup chat
 * never shows as a board card, its only home is the tab's full-page chat view.
 */
export function isRoutineSetupMode(agent: string | null | undefined): boolean {
  return (
    agent === ROUTINE_SETUP_AGENT_MODE || agent === REACTION_SETUP_AGENT_MODE
  );
}

// ── Chat ↔ item link resolution (pure, unit-tested) ───────────────────────
//
// The link is stored in BOTH directions because neither alone is durable:
// `routine.setup_activity_id` lives in routines.json, which the AGENT
// rewrites when it modifies a routine — one careless save drops the field
// and the chat would vanish mid-conversation. `activity.routine_id` lives in
// activity.json, which agents never touch, so the reverse link survives; the
// heal below then restores the forward link on disk.

interface SetupActivityLike {
  id: string;
  agent?: string | null;
  status?: string;
  routine_id?: string;
}
interface RoutineLinkLike {
  id: string;
  setup_activity_id?: string | null;
}

/** The chat attached to a routine: reverse link first (durable), then forward. */
export function findRoutineChatActivity<A extends SetupActivityLike>(
  activities: A[] | undefined,
  routine: RoutineLinkLike,
): A | null {
  const items = activities ?? [];
  return (
    items.find(
      (a) => isRoutineSetupMode(a.agent) && a.routine_id === routine.id,
    ) ??
    (routine.setup_activity_id
      ? (items.find((a) => a.id === routine.setup_activity_id) ?? null)
      : null)
  );
}

/**
 * Every live "item in construction" chat: a setup chat (current OR legacy
 * sentinel — pre-merge reaction drafts stay resumable) that no routine has
 * claimed yet, neither by forward link nor by its own `routine_id` stamp. A
 * person can have several going at once — each shows as its own
 * resumable/discardable item, so this returns ALL of them.
 */
export function findDraftSetupActivities<A extends SetupActivityLike>(
  activities: A[] | undefined,
  routines: RoutineLinkLike[] | undefined,
): A[] {
  const claimed = new Set<string>();
  for (const r of routines ?? []) {
    if (r.setup_activity_id) claimed.add(r.setup_activity_id);
  }
  return (activities ?? []).filter(
    (a) =>
      isRoutineSetupMode(a.agent) &&
      a.status !== "archived" &&
      !a.routine_id &&
      !claimed.has(a.id),
  );
}

export type RoutineChatHeal =
  | { kind: "stamp_activity"; activityId: string; routineId: string }
  | { kind: "stamp_routine"; activityId: string; routineId: string };

/**
 * The next link repair to apply, or null when everything is consistent.
 * One fix at a time — the caller applies it, queries refetch, and this runs
 * again until it returns null (each rule strictly reduces inconsistency, so
 * the loop terminates).
 */
export function findRoutineChatHeal(
  activities: SetupActivityLike[] | undefined,
  routines: RoutineLinkLike[] | undefined,
): RoutineChatHeal | null {
  const acts = activities ?? [];
  for (const r of routines ?? []) {
    // Forward link present but the activity is missing its reverse stamp
    // (agent-created routines, form-created claims): make the link durable.
    // Only stamp an unstamped activity — never reassign one.
    if (r.setup_activity_id) {
      const a = acts.find((x) => x.id === r.setup_activity_id);
      if (a && isRoutineSetupMode(a.agent) && !a.routine_id) {
        return { kind: "stamp_activity", activityId: a.id, routineId: r.id };
      }
    }
    // Reverse link present but the forward one is gone or dangling (the
    // agent rewrote the routine and dropped it): restore it on the routine.
    const back = acts.find(
      (x) => isRoutineSetupMode(x.agent) && x.routine_id === r.id,
    );
    if (
      back &&
      r.setup_activity_id !== back.id &&
      !acts.some((x) => x.id === r.setup_activity_id)
    ) {
      return { kind: "stamp_routine", activityId: back.id, routineId: r.id };
    }
  }
  return null;
}
