// Activities (board missions) + learnings. snake_case mirrors the on-disk
// .houston schemas (ui/agent-schemas) — files-first: the wire mirrors disk.
// `claude_session_id` is a legacy field name baked into user data; it stays.

import { z } from "zod";
import type { PendingInteraction } from "./interaction";

/** A human who started or collaborated on a mission. Server-stamped from the
 *  gateway-injected acting-as identity (hosted Teams); never sent by the agent. */
export interface ActivityContributor {
  user_id: string;
  name?: string;
}

/**
 * One @mention recorded on a mission (HOU-945): the LATEST time this teammate
 * was named in the mission's chat. One entry per person — a later mention
 * overwrites the earlier one's timestamp, so the array is a compact
 * "who has been pinged here, and when", not a log.
 */
export interface ActivityMention {
  /** The mentioned teammate's user id. */
  user_id: string;
  /** ISO 8601 instant of that most recent mention. */
  at: string;
  /** Who wrote the message (server-stamped acting identity), when known. */
  by?: string;
}

/** The most people one mission's aggregate tracks; older entries drop first. */
export const ACTIVITY_MENTIONS_MAX = 32;

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
  /**
   * The conversation this mission was started FROM, present only when the
   * agent itself created the mission with the `start_mission` tool
   * (PRODUCT-1244). Server-stamped by the missions sandbox route; presence is
   * what marks a mission as agent-started (the board's "Started by agent"
   * tag), and the value links back to the parent chat.
   */
  origin_session_key?: string;
  /** The human who created this mission (Teams attribution). Server-stamped. */
  created_by?: string;
  /** Humans who started or collaborated on this mission (Teams attribution).
   *  Server-stamped from acting-as identity; absent on desktop/single-player. */
  contributors?: ActivityContributor[];
  /**
   * Teammates @mentioned in this mission's chat, latest-per-person (HOU-945).
   * Server-stamped from the turn body under a gateway-verified acting identity;
   * absent on desktop/single-player, so those activity.json files stay
   * byte-identical.
   */
  mentioned?: ActivityMention[];
}

export const activityUpdateSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    claude_session_id: z.string().nullable().optional(),
    session_key: z.string().optional(),
    agent: z.string().optional(),
    worktree_path: z.string().nullable().optional(),
    routine_id: z.string().optional(),
    routine_run_id: z.string().optional(),
    skill_slug: z.string().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    pending_interaction: z.custom<PendingInteraction>().nullable().optional(),
  })
  .strict();

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
  provider?: string | null;
  model?: string | null;
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
  /**
   * The parent conversation, set ONLY by the host's missions sandbox route
   * when the agent starts a mission for itself (`start_mission`). Client
   * creates never send it.
   */
  origin_session_key?: string;
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
