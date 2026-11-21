export const MISSING_SKILL_KIND = "skill_not_found";

export function isMissingSkillError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; kind?: unknown };
  if (e.status === 404) return true;
  return e.kind === MISSING_SKILL_KIND;
}
