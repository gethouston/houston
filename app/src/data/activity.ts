/**
 * `.houston/activity/activity.json` — the board.
 *
 * Schema-validated via `@houston-ai/agent-schemas/activity.schema.json`.
 * Written atomically on every mutation (the backend handles the temp-file + rename).
 */

import type { PendingInteraction } from "@houston/protocol";
import schema from "@houston-ai/agent-schemas/activity.schema.json";
import {
  applyActivityPatch,
  applyBulkPatch,
  applyBulkRemove,
  applyRemove,
} from "./activity-bulk";
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
  provider?: string;
  model?: string;
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
  provider?: string;
  model?: string;
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

export async function create(
  agentPath: string,
  title: string,
  description = "",
  agent?: string,
  provider?: string,
  model?: string,
): Promise<Activity> {
  const items = await list(agentPath);
  const item: Activity = {
    id: newId(),
    title,
    description,
    status: "running",
    claude_session_id: null,
    agent,
    updated_at: now(),
    provider,
    model,
  };
  await writeAgentJson(agentPath, NAME, s, [...items, item]);
  return item;
}

export async function update(
  agentPath: string,
  id: string,
  patch: ActivityUpdate,
): Promise<Activity> {
  const items = await list(agentPath);
  const idx = items.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error(`Activity not found: ${id}`);
  // ONE merge rule, shared with the bulk path and mirroring the host's domain
  // `applyActivityUpdate` (clear on null, replace on an object, strip the
  // blocking steps on a move to done).
  const merged = applyActivityPatch(items[idx], patch, now());
  const next = [...items];
  next[idx] = merged;
  await writeAgentJson(agentPath, NAME, s, next);
  return merged;
}

/**
 * Delete an activity. Idempotent: removing an id that's already gone is a
 * no-op success — the desired end state (row absent) already holds, so there's
 * nothing to write. Mirrors `bulkRemove`'s "unknown ids are silently no-ops"
 * semantics and stops a double-delete (a UI click racing an agent / file-watcher
 * write that already removed the row) from rejecting as an unhandled rejection.
 * Genuine write failures still propagate.
 */
export async function remove(agentPath: string, id: string): Promise<void> {
  const items = await list(agentPath);
  const { items: next, removed } = applyRemove(items, id);
  if (!removed) return; // already gone — nothing to write
  await writeAgentJson(agentPath, NAME, s, next);
}

/**
 * Patch many activities in one read-mutate-write pass (e.g. bulk archive,
 * move-to). One file write → one engine event → one query invalidation,
 * instead of N round-trips. Unknown ids are silently no-ops.
 */
export async function bulkUpdate(
  agentPath: string,
  ids: string[],
  patch: ActivityUpdate,
): Promise<void> {
  const items = await list(agentPath);
  const next = applyBulkPatch(items, new Set(ids), patch, now());
  await writeAgentJson(agentPath, NAME, s, next);
}

/** Delete many activities in one read-mutate-write pass. */
export async function bulkRemove(
  agentPath: string,
  ids: string[],
): Promise<void> {
  const items = await list(agentPath);
  const next = applyBulkRemove(items, new Set(ids));
  await writeAgentJson(agentPath, NAME, s, next);
}
