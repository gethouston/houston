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
  /**
   * WHO taught this learning (provenance). Stamped by the host from the
   * gateway-injected acting-as identity when a turn saved it, or by the app
   * from the signed-in session when a person added it in Memory. Absent on
   * desktop / single-player, so those files stay free of identity keys.
   */
  taught_by?: ActivityContributor;
  /**
   * The mission (activity) whose conversation taught this learning, matched by
   * the turn's conversation id. Absent when nothing matched (settings-added
   * learnings, a routine run with no mission, a legacy entry).
   */
  mission_id?: string;
  /**
   * The mission's title AT SAVE TIME — a denormalized fallback so a renamed or
   * deleted mission still reads. Renderers prefer the live title looked up by
   * `mission_id` and fall back to this.
   */
  mission_title?: string;
}
