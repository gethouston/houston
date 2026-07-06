// Activities (board missions) + learnings. snake_case mirrors the on-disk
// .houston schemas (ui/agent-schemas) — files-first: the wire mirrors disk.
// `claude_session_id` is a legacy field name baked into user data; it stays.

import type { PendingInteraction } from "./interaction";

export interface Activity {
  id: string;
  title: string;
  description: string;
  status: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  updated_at?: string;
  provider?: string;
  model?: string;
  /** The one thing this mission is waiting on the user for, if any. Present
   *  drives the `needs_you` card; absent means the mission needs nothing. */
  pending_interaction?: PendingInteraction;
}

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: string;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  worktree_path?: string | null;
  routine_id?: string;
  routine_run_id?: string;
  provider?: string;
  model?: string;
  /** Set to record a new pending interaction; `null` clears it explicitly. */
  pending_interaction?: PendingInteraction | null;
}

export interface NewActivity {
  /**
   * Client-generated id. Lets the caller know the id (and the derived
   * `activity-<id>` session key) before the request lands — required for
   * optimistic mission creation against an engine that is still warming up
   * (HOU-693). Omitted → the host assigns one.
   */
  id?: string;
  title: string;
  description?: string;
  agent?: string;
  worktree_path?: string;
  provider?: string;
  model?: string;
}

export interface Learning {
  id: string;
  text: string;
  created_at: string;
}
