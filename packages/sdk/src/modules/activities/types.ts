/**
 * Wire + view-model types for the activities module — the board/missions read
 * surface the desktop builds its mission cards from
 * (`app/src/components/use-mission-control.ts`).
 *
 * The `activities/<agentId>` scope snapshot is the SDK-canonical version of what
 * the web control-plane adapter reads (`listActivities` →
 * `GET /agents/:id/activities` → `{ items }`), republished whole on every
 * change. Everything here is plain JSON — it crosses the
 * `getSnapshot`/`subscribe` boundary unchanged. Fields are exactly what the wire
 * `Activity` provides; nothing is invented.
 */

import type { Activity } from "@houston/protocol";

/**
 * The canonical activity statuses (`packages/domain/src/activities.ts`,
 * `ui/agent-schemas/activity.schema.json`). `status` is typed `string`, not this
 * union: the domain PRESERVES unknown statuses (forward-compat), so a surface
 * renders an unrecognized one neutrally. This constant is the known vocabulary
 * for a surface that maps statuses to columns, not a validation gate.
 */
export const ACTIVITY_STATUSES = [
  "running",
  "needs_you",
  "done",
  "error",
  "archived",
] as const;

/** One board item inside the `activities/<agentId>` scope snapshot. */
export interface ActivityItem {
  id: string;
  title: string;
  /** The user's first message (raw; a surface decodes the `houston:` marker). */
  description?: string;
  /** Canonical status incl. `archived`; unknown values pass through unchanged. */
  status: string;
  /** ISO timestamp of the last change, when the wire carries one. */
  updatedAt?: string;
  /** The chat/session address — the wire's `session_key`, or `activity-<id>`. */
  sessionKey: string;
  /** Present when this activity is a routine's chat. */
  routineId?: string;
  /** The agent-mode/config the mission runs under, when set. */
  agent?: string;
  worktreePath?: string | null;
  provider?: string;
  model?: string;
}

/**
 * The `activities/<agentId>` scope view-model: the WHOLE snapshot, republished
 * on any change. `loaded` is false until the first list resolves.
 */
export interface ActivitiesViewModel {
  loaded: boolean;
  items: ActivityItem[];
}

/** The result of creating a mission: its id + the chat session to open (PARITY §6). */
export interface CreatedActivity {
  id: string;
  sessionKey: string;
}

/** The typed facade for board/missions reads + writes. */
export interface ActivitiesModule {
  /** Scope string for `sdk.subscribe(...)` / `sdk.getSnapshot(...)`. */
  scope(agentId: string): string;
  /** Refetch the agent's activities and republish its scope snapshot. */
  refresh(agentId: string): Promise<void>;
  /** Create a mission (status `running`), then refetch. Returns id + sessionKey. */
  create(
    agentId: string,
    title: string,
    description?: string,
  ): Promise<CreatedActivity>;
  /** Transition a mission's status (approve→done, archive, reactivate), then refetch. */
  setStatus(agentId: string, id: string, status: string): Promise<void>;
  /**
   * PATCH the board-card status for the activity addressed by `sessionKey` (the
   * turn machinery's board persist on the SDK path — it knows a chat's session
   * key, not the activity id). Resolves the id via
   * {@link matchesActivitySessionKey}, then reuses {@link setStatus}'s write +
   * silent refetch. A `sessionKey` with no matching card (a transient chat with
   * no board mission) is logged via the injected logger and skipped — a live
   * turn must never crash on a missing card, so this never throws for that case.
   */
  setStatusBySessionKey(
    agentId: string,
    sessionKey: string,
    status: string,
  ): Promise<void>;
  /** Rename a mission, then refetch. */
  rename(agentId: string, id: string, title: string): Promise<void>;
  /** Delete a mission, then refetch. */
  delete(agentId: string, id: string): Promise<void>;
  /** Stop the reactivity stream. Module-local; the kernel calls it on dispose. */
  dispose(): void;
}

/** The reactive scope this module owns, per agent. */
export const activitiesScope = (agentId: string): string =>
  `activities/${agentId}`;

/** The command types this module registers. Typed to defeat string drift. */
export const ActivitiesCommand = {
  Refresh: "activities/refresh",
  Create: "activities/create",
  SetStatus: "activities/setStatus",
  Rename: "activities/rename",
  Delete: "activities/delete",
} as const;
export type ActivitiesCommandType =
  (typeof ActivitiesCommand)[keyof typeof ActivitiesCommand];

/** The host wire-event `type` that means an agent's activities changed. */
export const ACTIVITY_CHANGED_EVENT = "ActivityChanged";

/**
 * The board's session address for an activity: the explicit `session_key`, or
 * the `activity-<id>` convention the board uses for missions with no explicit
 * key (PARITY §6). A routine chat carries its own `session_key`.
 */
export function sessionKeyOf(a: Activity): string {
  return a.session_key ?? `activity-${a.id}`;
}

/**
 * True when `sessionKey` addresses activity `a`: its explicit `session_key` OR
 * the `activity-<id>` board convention. Matches EITHER form (not just
 * {@link sessionKeyOf}'s preferred one), identical to the web adapter's resolver
 * (`engine-adapter/client.ts` `setActivityStatus`), so a turn's board-status
 * write lands on the same card on both surfaces.
 */
export function matchesActivitySessionKey(
  a: Activity,
  sessionKey: string,
): boolean {
  return a.session_key === sessionKey || `activity-${a.id}` === sessionKey;
}

/** Project a wire `Activity` onto the scope view-model item. Lossless for the
 *  fields a surface reads; omits empty optionals so the snapshot stays clean. */
export function toActivityItem(a: Activity): ActivityItem {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    sessionKey: sessionKeyOf(a),
    ...(a.description ? { description: a.description } : {}),
    ...(a.updated_at !== undefined ? { updatedAt: a.updated_at } : {}),
    ...(a.routine_id !== undefined ? { routineId: a.routine_id } : {}),
    ...(a.agent !== undefined ? { agent: a.agent } : {}),
    ...(a.worktree_path !== undefined ? { worktreePath: a.worktree_path } : {}),
    ...(a.provider !== undefined ? { provider: a.provider } : {}),
    ...(a.model !== undefined ? { model: a.model } : {}),
  };
}
