import type { KanbanItem } from "@houston-ai/board";
import type { Activity, Routine } from "@houston-ai/engine-client";
import type { RoutineRun } from "@houston-ai/routines";

/**
 * Routines-tab selection state: which item, if any, owns the right-hand chat
 * pane. The list is now ALWAYS visible (email-client split) — this is the
 * cursor into it, not a full-page view swap:
 * - `null` — nothing selected; the list runs full width, no pane.
 * - `intake` — the pre-model create flow (chat surface + locally-driven intake
 *   cards floating over it), before any model call.
 * - `routine` — an existing routine's chat.
 * - `draft` — a not-yet-created routine's chat, keyed by its own activity id (a
 *   person can have several drafts going, each independently selectable).
 *   `activityId` null = the draft chat is still being created (calm surface).
 */
export type Selection =
  | { kind: "intake" }
  | { kind: "routine"; routineId: string }
  | { kind: "draft"; activityId: string | null };

/**
 * Adopt the freshly-created draft id, but only if the user is still waiting on
 * the pending null-draft (a functional setState guard): a failed start (no id)
 * clears the selection, and a user who already moved on is left alone.
 */
export function adoptDraft(
  current: Selection | null,
  activityId: string | null,
): Selection | null {
  if (current?.kind !== "draft" || current.activityId !== null) {
    return current;
  }
  return activityId ? { kind: "draft", activityId } : null;
}

/**
 * Clear the selection, but only if the user is still on that same routine's
 * chat — a slow failed `startForRoutine` must never deselect a user who has
 * since selected something else.
 */
export function deselectIfOn(
  current: Selection | null,
  routineId: string,
): Selection | null {
  return current?.kind === "routine" && current.routineId === routineId
    ? null
    : current;
}

/**
 * Row re-click toggles selection off. Selecting an already-selected routine
 * deselects it (the pane closes); selecting any other routine — or nothing
 * selected — selects it.
 */
export function toggleRoutine(
  current: Selection | null,
  routineId: string,
): Selection | null {
  return current?.kind === "routine" && current.routineId === routineId
    ? null
    : { kind: "routine", routineId };
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
  | { action: "open"; selection: Selection }
  | { action: "clear" }
  | { action: "wait" };

/**
 * Resolve a one-shot notification activity id (#401) to a selection. A claimed
 * routine wins; else an unclaimed draft; else, once BOTH data sources have
 * loaded and nothing matched, clear the stale/foreign id (never select);
 * otherwise keep waiting for the data to arrive.
 */
export function resolvePendingActivity(
  pendingId: string,
  routines: Routine[] | undefined,
  chatSetup: ChatSetupView,
): PendingResolution {
  const claimed = claimedRoutineId(pendingId, routines, chatSetup);
  if (claimed)
    return {
      action: "open",
      selection: { kind: "routine", routineId: claimed },
    };
  if (chatSetup.draftActivities.some((a) => a.id === pendingId)) {
    return {
      action: "open",
      selection: { kind: "draft", activityId: pendingId },
    };
  }
  const loaded = routines !== undefined && chatSetup.activitiesLoaded;
  return loaded ? { action: "clear" } : { action: "wait" };
}

/**
 * The single board card the setup chat mounts. The board renders only its
 * portaled detail panel (its list stays hidden), so this item just carries the
 * activity's identity/status for the panel header.
 */
export function setupChatItem(
  activity: Activity,
  group: string,
  sessionKey: string | null,
): KanbanItem {
  return {
    id: activity.id,
    title: activity.title,
    description: "",
    status: activity.status,
    updatedAt: activity.updated_at ?? new Date().toISOString(),
    group,
    metadata: sessionKey ? { sessionKey } : {},
  };
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
