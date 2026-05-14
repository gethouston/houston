/**
 * `.houston/activity/activity.json` — the board.
 *
 * Schema-validated via `@houston-ai/agent-schemas/activity.schema.json`.
 * Written atomically on every mutation (the backend handles the temp-file + rename).
 */

import schema from "@houston-ai/agent-schemas/activity.schema.json";
import { newId, now, readAgentJson, writeAgentJson } from "./agent-file";

/**
 * Mirrors the engine's `ActivityStatus` enum (engine/houston-engine-core
 * /src/agents/status.rs). Authoritative source is the Rust side; this
 * union exists so the typechecker catches drift at compile time.
 */
export type ActivityStatus =
  | "queued"
  | "running"
  | "needs_you"
  | "done"
  | "error"
  | "cancelled"
  | "interrupted";

// Lease metadata (lease_id, owner_pid, expires_at) lives in the
// engine-owned runtime store at ~/.houston/runtime/leases.json — NOT
// on the activity row. The UI doesn't need it for display, and putting
// it inside the agent-writable `.houston/activity/activity.json` would
// let a buggy or malicious agent forge `expires_at` and become
// un-reapable. If the UI ever needs to surface "this mission has an
// active lease", expose a dedicated endpoint rather than putting the
// raw token back on the activity record.

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: ActivityStatus;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  updated_at?: string;
  provider?: string;
  model?: string;
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: ActivityStatus;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  provider?: string;
  model?: string;
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
  worktreePath?: string,
  provider?: string,
  model?: string,
): Promise<Activity> {
  const items = await list(agentPath);
  const item: Activity = {
    id: newId(),
    title,
    description,
    // Born `queued` so the engine's reaper never sees a `running` row
    // without an attached lease — `sessions::start` is responsible for
    // promoting to `running` and minting the lease at the same time.
    status: "queued",
    claude_session_id: null,
    agent,
    worktree_path: worktreePath ?? null,
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
  const merged: Activity = {
    ...items[idx],
    ...patch,
    updated_at: now(),
  };
  const next = [...items];
  next[idx] = merged;
  await writeAgentJson(agentPath, NAME, s, next);
  return merged;
}

export async function remove(agentPath: string, id: string): Promise<void> {
  const items = await list(agentPath);
  const next = items.filter((a) => a.id !== id);
  if (next.length === items.length) throw new Error(`Activity not found: ${id}`);
  await writeAgentJson(agentPath, NAME, s, next);
}
