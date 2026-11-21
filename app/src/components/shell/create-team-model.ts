export const MAX_TEAM_NAME_LENGTH = 60;

export type TeamNameError = "empty" | "too_long";

type TeamNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: TeamNameError };

export function validateTeamName(raw: string): TeamNameValidation {
  const name = raw.trim();
  if (name.length === 0) return { ok: false, reason: "empty" };
  if (name.length > MAX_TEAM_NAME_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, name };
}
