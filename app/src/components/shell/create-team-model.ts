/**
 * Pure, DOM-free validation for the Create-team dialog (C8 §Share-triggers-team
 * / self-serve team creation). Extracted so the "what's a valid team name" rule
 * is unit-tested in isolation and the dialog stays a thin view over it. The
 * gateway is the real authority (`POST /v1/orgs` re-validates); this only gates
 * the submit button and inline hint so a user never fires a call that will
 * bounce for an obviously empty or over-long name.
 */

/** Upper bound on a team name. Matches the workspace-name feel: a short label,
 *  not a paragraph. The gateway may clamp tighter; this is the client hint. */
export const MAX_TEAM_NAME_LENGTH = 60;

/** Why a raw team-name input is not yet submittable. */
export type TeamNameError = "empty" | "too_long";

export type TeamNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: TeamNameError };

/**
 * Validate (and normalize) a raw team-name input. Trims first: leading/trailing
 * whitespace never counts toward "non-empty" or the length ceiling, and the
 * trimmed value is what the caller submits.
 */
export function validateTeamName(raw: string): TeamNameValidation {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, reason: "empty" };
  if (name.length > MAX_TEAM_NAME_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, name };
}
