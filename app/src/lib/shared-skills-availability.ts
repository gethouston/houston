export const SHARED_SKILLS_UNCONFIGURED = "shared skills not configured";

export function isSharedSkillsUnconfiguredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; body?: unknown };
  if (e.status !== 503) return false;
  const body = e.body as { error?: unknown } | null;
  return body?.error === SHARED_SKILLS_UNCONFIGURED;
}

export function sharedSkillsAvailable(
  advertised: boolean,
  list: { configured: boolean } | undefined,
): boolean {
  return advertised && list?.configured !== false;
}
