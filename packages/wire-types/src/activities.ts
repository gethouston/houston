/**
 * Missions: the board row an agent's `activity.json` holds, the writes that
 * create and update it, and the cross-agent conversation sweep that lists them.
 */

import type { MissionStarter } from "@houston/protocol";
import type { PendingInteraction } from "./interactions";

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
  /** The installed skill (directory slug) this setup chat belongs to. The
   *  durable reverse direction of the skill <-> chat link (HOU-791). */
  skill_slug?: string;
  updated_at?: string;
  last_message_at?: string;
  provider?: string;
  model?: string;
  /** The conversation this mission was started from, present only when the
   *  agent created the mission itself (PRODUCT-1244). Server-stamped. */
  origin_session_key?: string;
  /** Server-stamped agent that started this mission. */
  origin_agent?: string;
  /** Which AI started this mission (PRODUCT-1928). The host stamps it on the
   *  typed mission-creation routes and never accepts it from a create body or
   *  PATCH; raw file writes and imports carry whatever the file holds. Absent
   *  on a person's mission and on older rows. */
  started_by?: MissionStarter;
  pending_interaction?: PendingInteraction;
  /** The human who created this mission (Teams attribution). Server-stamped
   *  from the gateway acting-as identity; absent on desktop/single-player. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  contributors?: { user_id: string; name?: string }[];
  /** Teammates @mentioned in this mission's chat, latest per person.
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  mentioned?: { user_id: string; at: string; by?: string }[];
}

/**
 * A mission's board status. The closed set a WRITE may set, mirroring
 * `ACTIVITY_STATUSES` (@houston/domain) — which this package cannot import, it
 * being a dependency-free client type mirror. Reads keep `Activity.status` open
 * on purpose: a status written by a newer host renders neutrally instead of
 * being dropped.
 */
export type ActivityStatus =
  | "running"
  | "needs_you"
  | "done"
  | "error"
  | "archived";

export interface ActivityUpdate {
  title?: string;
  description?: string;
  status?: ActivityStatus;
  claude_session_id?: string | null;
  session_key?: string;
  agent?: string;
  routine_id?: string;
  routine_run_id?: string;
  skill_slug?: string;
  provider?: string | null;
  model?: string | null;
  /** Set to record a new pending interaction; `null` clears it explicitly. */
  pending_interaction?: PendingInteraction | null;
}

export interface NewActivity {
  /**
   * Client-generated id, so the caller knows the id (and the derived
   * `activity-<id>` session key) before the request lands — optimistic
   * mission creation against a warming engine (HOU-693). Omitted → the
   * host assigns one.
   */
  id?: string;
  title: string;
  description?: string;
  agent?: string;
  provider?: string;
  model?: string;
}

// ---------- Conversations ----------

export interface ConversationEntry {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: string;
  session_key: string;
  updated_at?: string;
  last_message_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
  routine_id?: string;
  /** The row's provider/model pin (pi's canonical provider id), carried so a
   *  board seeded from the cross-agent sweep never presents a pinned chat as
   *  pin-less (PRODUCT-1771). Absent on rows that were never pinned. */
  provider?: string;
  model?: string;
  /** The conversation this mission was started from, present only when the
   *  agent created the mission itself (PRODUCT-1244). Server-stamped. */
  origin_session_key?: string;
  /** Server-stamped agent that started this mission. */
  origin_agent?: string;
  /** Which AI started this mission (PRODUCT-1928). The host stamps it on the
   *  typed mission-creation routes and never accepts it from a create body or
   *  PATCH; raw file writes and imports carry whatever the file holds. Absent
   *  on a person's mission and on older rows. */
  started_by?: MissionStarter;
  /** The human who created this mission (Teams attribution). Server-stamped
   *  from the gateway acting-as identity; absent on desktop/single-player. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  contributors?: { user_id: string; name?: string }[];
  /** Teammates @mentioned in this mission's chat, latest per person.
   *  Server-stamped in multiplayer only; absent on desktop/single-player. */
  mentioned?: { user_id: string; at: string; by?: string }[];
}

/**
 * The result of a CROSS-AGENT conversation sweep (`listAllConversations`).
 *
 * In hosted mode the sweep is a fan-out — one read per agent — and any single
 * agent's read can fail on its own (a pod that never woke, a gateway blip)
 * while every other agent answers. A bare array cannot express that: it either
 * rejects (blanking the board over one sick agent) or looks like a complete
 * answer (silently dropping that agent's missions and freezing the gap in
 * cache). So the sweep reports WHICH agents it could not read, and the caller
 * decides how to recover (HOU-981).
 *
 * `failedAgents` empty = a complete, trustworthy answer.
 */
export interface AllConversationsResult {
  /** Rows from every agent that answered, flattened. */
  conversations: ConversationEntry[];
  /** Agents whose read failed in THIS sweep. Non-empty = partial. */
  failedAgents: FailedAgentRead[];
}

/**
 * One agent the sweep could not read, WITH the error its read threw. The
 * reason travels so the surface layer can classify the failure — a waking
 * pod's "engine unavailable" 503 is an expected state with its own quiet
 * surface, while a real failure must reach crash reporting — instead of
 * reporting every partial sweep blind (HOUSTON-APP-538).
 */
export interface FailedAgentRead {
  agentPath: string;
  /** What the read threw, verbatim. */
  reason: unknown;
}
