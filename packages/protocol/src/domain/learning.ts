// A learning: one memory an agent keeps across sessions. snake_case mirrors
// the on-disk `.houston/learnings/learnings.json` schema (ui/agent-schemas).

import type { ActivityContributor } from "./activity";

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
  /**
   * When this memory was archived (ISO time). An archived memory was folded
   * into a newer one by a `save_learning` call that named it in `replaces`:
   * it is never deleted, stays searchable through recall, and is left out of
   * the prompt, the Memory list, the size cap, and anything that leaves the
   * agent (exports, copies).
   */
  archived_at?: string;
  /** The id of the learning that replaced this one, set beside `archived_at`. */
  replaced_by?: string;
}

/** True for a memory consolidation archived (see `Learning.archived_at`). */
export function isArchivedLearning(
  learning: Pick<Learning, "archived_at">,
): boolean {
  return typeof learning.archived_at === "string";
}

/**
 * Why a learning save was refused, beside the agent-actionable `error` text.
 * The runtime relays the host's own words in full for these codes (instead
 * of a clipped "refused" line): both carry the active memory list the agent
 * needs to consolidate.
 *  - `memory_full`: the personal assistant's active memory is at its cap.
 *  - `memory_replace_refused`: a `replaces` ref was unknown, ambiguous, or
 *    already archived.
 */
export type LearningRefusalCode = "memory_full" | "memory_replace_refused";

export function isLearningRefusalCode(
  code: unknown,
): code is LearningRefusalCode {
  return code === "memory_full" || code === "memory_replace_refused";
}
