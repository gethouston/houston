// Activities (board missions) + learnings. snake_case mirrors the on-disk
// .houston schemas (ui/agent-schemas) — files-first: the wire mirrors disk.
// `claude_session_id` is a legacy field name baked into user data; it stays.

import type { PendingInteraction } from "./interaction";

/** A human who started or collaborated on a mission. Server-stamped from the
 *  gateway-injected acting-as identity (hosted Teams); never sent by the agent. */
export interface ActivityContributor {
  user_id: string;
  name?: string;
}

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
  /** The installed skill (directory slug) this setup chat belongs to. The
   *  durable direction of the skill <-> chat link: agents rewrite SKILL.md
   *  (which carries the forward `setup_activity_id`) but never activity.json,
   *  so this client-stamped reverse link survives (HOU-791, mirrors
   *  `routine_id`). */
  skill_slug?: string;
  updated_at?: string;
  provider?: string;
  model?: string;
  /** The one thing this mission is waiting on the user for, if any. Present
   *  drives the `needs_you` card; absent means the mission needs nothing. */
  pending_interaction?: PendingInteraction;
  /** The human who created this mission (Teams attribution). Server-stamped. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped from acting-as identity; absent on desktop/single-player. */
  contributors?: ActivityContributor[];
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
  skill_slug?: string;
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
