/**
 * `.houston/activity/activity.json` — the board.
 *
 * Schema-validated via `@houston-ai/agent-schemas/activity.schema.json`.
 * Written atomically on every mutation (the backend handles the temp-file + rename),
 * one mutation per agent at a time (`activity-writes.ts`).
 */

import type { PendingInteraction } from "@houston/protocol";
import schema from "@houston-ai/agent-schemas/activity.schema.json";
import { activityWrites } from "./activity-writes";
import { newId, now, readAgentJson, writeAgentJson } from "./agent-file";

/** Every status a mission can have. Mirrors the `status` enum in
 *  `activity.schema.json` (the on-disk source of truth). */
export const ACTIVITY_STATUSES = [
  "running",
  "needs_you",
  "done",
  "error",
  "archived",
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  /** The installed skill (directory slug) this setup chat belongs to — the
   *  durable reverse direction of the skill <-> chat link (HOU-791). */
  skill_slug?: string;
  updated_at?: string;
  last_message_at?: string;
  provider?: string;
  model?: string;
  /** The conversation this mission was started from, present only when the
   *  agent created the mission itself (PRODUCT-1244). Set by Houston. */
  origin_session_key?: string;
  pending_interaction?: PendingInteraction;
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  /** The mission's model pin; `null` DELETES the key (see `applyActivityPatch`). */
  provider?: string | null;
  model?: string | null;
  /**
   * The mission's persisted pending interaction.
   *  - a VALID interaction object REPLACES the stored one (per-step dismissal
   *    writes back the remaining steps, so dismissing one offer never kills its
   *    sibling).
   *  - `null` CLEARS it — the key is DELETED rather than written as `null`,
   *    since the schema has no null type.
   *  - absent — or malformed, which reads the same — leaves it alone, EXCEPT on
   *    a `status: "done"` patch, which strips the blocking steps and keeps the
   *    clean-finish offers (see `applyActivityPatch`).
   */
  pending_interaction?: PendingInteraction | null;
}

const NAME = "activity";
const s = schema as unknown as Parameters<typeof readAgentJson>[2];

export async function list(agentPath: string): Promise<Activity[]> {
  return readAgentJson<Activity[]>(agentPath, NAME, s, []);
}

const writes = activityWrites({
  list,
  write: (agentPath, items) => writeAgentJson(agentPath, NAME, s, items),
  now,
  newId,
});

export function create(
  agentPath: string,
  title: string,
  description = "",
  agent?: string,
  provider?: string,
  model?: string,
): Promise<Activity> {
  return writes.create(agentPath, title, description, agent, provider, model);
}

/** Merge `patch` into one mission; rejects when the id is unknown. */
export const update = writes.update;

/**
 * Delete an activity. Idempotent: removing an id that's already gone is a
 * no-op success — the desired end state (row absent) already holds, so there's
 * nothing to write. Mirrors `bulkRemove`'s "unknown ids are silently no-ops"
 * semantics and stops a double-delete (a UI click racing an agent / file-watcher
 * write that already removed the row) from rejecting as an unhandled rejection.
 * Genuine write failures still propagate.
 */
export const remove = writes.remove;

/**
 * Patch many activities in one read-mutate-write pass (e.g. bulk archive,
 * move-to). One file write → one engine event → one query invalidation,
 * instead of N round-trips. Unknown ids are silently no-ops.
 */
export const bulkUpdate = writes.bulkUpdate;

/** Delete many activities in one read-mutate-write pass. */
export const bulkRemove = writes.bulkRemove;
