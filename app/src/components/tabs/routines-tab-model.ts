import type {
  NewRoutine,
  Routine,
  RoutineUpdate,
} from "@houston-ai/engine-client";
import type { RoutineEditPatch, RoutineRun } from "@houston-ai/routines";

/**
 * Routines-tab view state: the list, an existing routine's full-page chat,
 * or a draft chat for a not-yet-created routine (keyed by its own activity
 * id — a person can have several drafts going, each independently resumable).
 */
export type View =
  | { type: "grid" }
  | { type: "chat"; routineId: string }
  /** activityId null = the draft chat is still being created (show loading). */
  | { type: "chat-draft"; activityId: string | null };

/**
 * Fill an inline-editor patch out to a full `NewRoutine`: a manually-created
 * routine is silent-by-default (only pings on attention), shares one ongoing
 * chat, and starts with no integrations. Its wake mechanism is exactly one of a
 * cron `schedule` or an event `trigger` (C9), discriminated by the patch's wake.
 */
export function newRoutineInput(patch: RoutineEditPatch): NewRoutine {
  const base = {
    name: patch.name,
    prompt: patch.prompt,
    suppress_when_silent: true,
    chat_mode: "shared" as const,
    integrations: [],
  };
  return patch.wake.mode === "event"
    ? { ...base, trigger: patch.wake.trigger }
    : { ...base, schedule: patch.wake.schedule };
}

/**
 * Map an editor patch to a `RoutineUpdate`. Switching to an event wake sends the
 * `trigger`; switching to (or keeping) a schedule sends the cron AND clears any
 * `trigger` (`null`) so the server's exactly-one invariant holds either way.
 */
export function routineUpdateFromPatch(patch: RoutineEditPatch): RoutineUpdate {
  const base = { name: patch.name, prompt: patch.prompt };
  return patch.wake.mode === "event"
    ? { ...base, trigger: patch.wake.trigger }
    : { ...base, schedule: patch.wake.schedule, trigger: null };
}

/**
 * Adopt the freshly-created draft id, but only if the user is still waiting on
 * the pending null-draft (a functional setView guard): a failed start (no id)
 * falls back to the grid, and a user who already navigated away is left alone.
 */
export function adoptDraft(current: View, activityId: string | null): View {
  if (current.type !== "chat-draft" || current.activityId !== null) {
    return current;
  }
  return activityId ? { type: "chat-draft", activityId } : { type: "grid" };
}

/**
 * Guard a routine chat back to the grid, but only if the user is still on that
 * same routine's chat — a slow failed `startForRoutine` must never yank a user
 * who has since navigated elsewhere.
 */
export function backToGridIfOn(current: View, routineId: string): View {
  return current.type === "chat" && current.routineId === routineId
    ? { type: "grid" }
    : current;
}

/** Enough of the chat-setup hook for the pure resolvers below. */
export interface ChatSetupView {
  activityFor: (routine: Routine) => { id: string } | null;
  draftActivities: { id: string }[];
  activitiesLoaded: boolean;
}

/** The routine whose chat is `activityId`, if any (claimed draft → routine). */
export function claimedRoutineId(
  activityId: string,
  routines: Routine[] | undefined,
  chatSetup: ChatSetupView,
): string | undefined {
  return routines?.find((r) => chatSetup.activityFor(r)?.id === activityId)?.id;
}

/** What the notification deep-link effect should do with a pending activity id. */
export type PendingResolution =
  | { action: "open"; view: View }
  | { action: "clear" }
  | { action: "wait" };

/**
 * Resolve a one-shot notification activity id to a navigation. A claimed
 * routine wins; else an unclaimed draft; else, once BOTH data sources have
 * loaded and nothing matched, clear the stale/foreign id (never navigate);
 * otherwise keep waiting for the data to arrive.
 */
export function resolvePendingActivity(
  pendingId: string,
  routines: Routine[] | undefined,
  chatSetup: ChatSetupView,
): PendingResolution {
  const claimed = claimedRoutineId(pendingId, routines, chatSetup);
  if (claimed)
    return { action: "open", view: { type: "chat", routineId: claimed } };
  if (chatSetup.draftActivities.some((a) => a.id === pendingId)) {
    return {
      action: "open",
      view: { type: "chat-draft", activityId: pendingId },
    };
  }
  const loaded = routines !== undefined && chatSetup.activitiesLoaded;
  return loaded ? { action: "clear" } : { action: "wait" };
}

/**
 * The routines list is ONE file holding both kinds (exactly one of
 * `schedule`/`trigger` per routine, C9); the Routines and Reactions tabs are
 * filtered views of it. Schedule-driven routines have no `trigger`; event-driven
 * reactions have one.
 */
export function scheduleRoutines(routines: Routine[] | undefined): Routine[] {
  return (routines ?? []).filter((r) => !r.trigger);
}

/** Event-driven reactions: the routines that wake on a `trigger`. */
export function reactionRoutines(routines: Routine[] | undefined): Routine[] {
  return (routines ?? []).filter((r) => !!r.trigger);
}

/** Most recent run per routine id, keyed by `routine_id`. */
export function latestRunByRoutine(
  runs: RoutineRun[] | undefined,
): Record<string, RoutineRun> {
  if (!runs) return {};
  const map: Record<string, RoutineRun> = {};
  for (const run of runs) {
    const existing = map[run.routine_id];
    if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
      map[run.routine_id] = run;
    }
  }
  return map;
}
