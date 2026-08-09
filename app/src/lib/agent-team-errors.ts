import { shareErrorCode } from "./share-via-team.ts";

/**
 * The expected-state taxonomy for the C13 agent-teams writes, following the
 * `isNeedsUpgradeError` precedent in `team-status-model.ts`: pure, DOM-free, so
 * the classification and the copy map unit-test under bare Node.
 *
 * Every agent-teams MUTATION passes `{ silence: isExpectedAgentTeamError }` and
 * carries an `onError` that shows {@link agentTeamErrorCopy}'s strings in a
 * plain informational toast. That gives EXACTLY ONE surface either way:
 * expected -> the informational toast, unexpected -> `call()`'s red
 * "report a bug" toast. Never add a branch for these to `surfaceError` in
 * `tauri.ts`: `personal_space` already means something else there (the invite
 * flow), and the error alone cannot tell the two apart.
 */

/**
 * The C13 rejections that are EXPECTED business states, not Houston bugs: the
 * default team refusing a rename-adjacent write, a personal space refusing to
 * manage PEOPLE (it groups agents into teams like any other space; only join
 * and the two member writes refuse there), a non-owner attempting an owner-only
 * write, a stale team id, a name the gateway will not take, and removing
 * someone who is not an explicit member. The code set is unchanged by that
 * narrowing — `personal_space` is still one answer the gateway can give, just
 * from three routes instead of every mutation.
 *
 * Everything else the gateway can answer (`team_not_found`,
 * `invalid_sort_order`, `invalid_owner`) means the client sent something it
 * should never have sent, so it must reach us as a bug report.
 *
 * `invalid_name` is here as belt and braces, and it is the only entry the USER
 * can provoke by typing. Every name-bearing input already stops at the
 * gateway's ceiling of 1..60 runes (`TEAM_NAME_MAX_RUNES`), so this should be
 * unreachable; if a name ever does get past them, a calm sentence about how
 * long a name may be is a truer answer than "report a bug".
 *
 * `invalid_icon` and `invalid_color` are the same bet, and the same honesty is
 * owed about it: they too should be unreachable. The gateway validates SHAPE
 * only (`^[a-z0-9-]{1,32}$` for a glyph name, `#rrggbb` or a token name for a
 * color) because the VOCABULARY is the client's, and the picker only ever sends
 * a name from the client's own curated glyph set and a color from the shared
 * palette. So one of these arriving means the two drifted apart, which is our
 * bug — but the user is mid-gesture in a picker and nothing was changed, so a
 * calm sentence pointing back at the list beats a report-a-bug toast for a
 * choice they made from a list we drew.
 */
const EXPECTED_AGENT_TEAM_CODES = new Set([
  "default_team",
  "personal_space",
  "not_team_owner",
  "invalid_team_id",
  "invalid_name",
  "invalid_icon",
  "invalid_color",
  "not_a_member",
]);

/**
 * The machine-readable code of a gateway rejection, or `undefined`. Reuses
 * `shareErrorCode`, which already handles the FLAT `{error, code}` shape the Go
 * edge answers with (and which `HoustonEngineError.code` alone misses).
 */
export function agentTeamErrorCode(err: unknown): string | undefined {
  return shareErrorCode(err);
}

/** True for a rejection the agent-teams surfaces explain instead of reporting. */
export function isExpectedAgentTeamError(err: unknown): boolean {
  const code = agentTeamErrorCode(err);
  return code !== undefined && EXPECTED_AGENT_TEAM_CODES.has(code);
}

/**
 * The i18n keys for one expected rejection, or `null` when the error is not one
 * of them (the caller then does nothing and lets the generic bug toast own the
 * surface). Returning KEYS rather than sentences is what keeps this module pure
 * and testable: the `t()` call belongs to the component.
 */
export function agentTeamErrorCopy(
  err: unknown,
): { titleKey: string; bodyKey: string } | null {
  const code = agentTeamErrorCode(err);
  if (code === undefined || !EXPECTED_AGENT_TEAM_CODES.has(code)) return null;
  return {
    titleKey: `teams:agentTeams.errors.${code}.title`,
    bodyKey: `teams:agentTeams.errors.${code}.body`,
  };
}
