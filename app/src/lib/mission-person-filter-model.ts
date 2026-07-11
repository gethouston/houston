/**
 * Pure, DOM-free visibility decision for the Mission Control person filter
 * (C8 §Client UX). Extracted so the personal-space teaser vs. real-filter vs.
 * hidden matrix is unit-tested in isolation — no React, no store, no host.
 *
 * The rules (product discussion, C8 spaces):
 * - Signed out → nothing renders.
 * - Spaces host, TEAM space → the real filter (Everyone + Mine + roster).
 * - Spaces host, PERSONAL space → a teaser: the control is visible with
 *   Everyone + an "invite your team" row, but NO "My missions" option (in a
 *   solo personal space it would filter to zero — the teaser sells sharing
 *   instead of dead-ending).
 * - Legacy multiplayer host WITHOUT spaces (pre-C8 Teams) → the real filter,
 *   byte-identical to today.
 * - Single-player / no-spaces host → hidden, exactly as before.
 */
export type PersonFilterMode = "hidden" | "teaser" | "filter";

export interface PersonFilterInputs {
  /** A user session is present (someone is signed in). */
  hasSession: boolean;
  /** The deployment serves C8 Spaces (`capabilities.spaces`). */
  spaces: boolean;
  /** The deployment runs in multiplayer mode (`capabilities.multiplayer`). */
  multiplayer: boolean;
  /** The ACTIVE workspace is a team space (`org:<slug>`), not personal. */
  teamSpace: boolean;
}

/**
 * Decide how the person filter presents. On a spaces host the active-space
 * KIND (team vs. personal) selects real-filter vs. teaser; off spaces the
 * legacy multiplayer flag alone gates the real filter.
 */
export function personFilterMode(opts: PersonFilterInputs): PersonFilterMode {
  if (!opts.hasSession) return "hidden";
  if (opts.spaces) return opts.teamSpace ? "filter" : "teaser";
  return opts.multiplayer ? "filter" : "hidden";
}
