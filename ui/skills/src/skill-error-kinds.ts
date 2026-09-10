/**
 * Stable machine-readable error kinds emitted by the host for skill-related
 * routes. UI matches on these to render plain-English copy without parsing
 * error message strings.
 *
 * Source of truth: `packages/host/src/skills/remote-error.ts` — keep the
 * union below in sync with `SkillRemoteErrorKind` there.
 */
export type SkillErrorKind =
  | "rate_limited"
  | "offline"
  /** Skills.sh took longer than the host's request budget. */
  | "upstream_timeout"
  /** Skills.sh answered with a non-OK status or an unusable body. */
  | "upstream_error"
  | "already_installed"
  | "skill_not_found"
  | "skill_not_in_repo"
  | "skill_malformed"
  | "validation"
  | "parse_failed"
  | "patch_not_found"
  | "repo_private"
  | "repo_not_found"
  | "repo_no_skills"
  | "invalid_repo_source"
  | "github_rate_limited";

/**
 * Pull the typed `kind` off any thrown value. Works whether the
 * caller threw a `HoustonEngineError` (which exposes `.kind` via a
 * getter on `error.details.kind`) or a plain `{ kind }` object.
 *
 * Returns `undefined` when the error isn't typed — callers should
 * default to a generic "something went wrong" copy in that case.
 */
export function getSkillErrorKind(err: unknown): SkillErrorKind | undefined {
  if (!err || typeof err !== "object") return undefined;
  if ("kind" in err) {
    const k = (err as { kind?: unknown }).kind;
    if (typeof k === "string") return k as SkillErrorKind;
  }
  return undefined;
}

/**
 * Some errors aren't engine-typed but we can still recognize them.
 * Network failures from `fetch` show up as `TypeError: Failed to fetch`
 * (browser) or `AbortError` (when we cancelled the request ourselves).
 * Map both into the typed surface so the UI can render the right copy.
 */
export function classifySkillError(
  err: unknown,
): SkillErrorKind | "aborted" | "unknown" {
  if (err instanceof DOMException && err.name === "AbortError")
    return "aborted";
  if (err instanceof Error && err.name === "AbortError") return "aborted";
  const kind = getSkillErrorKind(err);
  if (kind) return kind;
  if (err instanceof TypeError && /fetch/i.test(err.message)) return "offline";
  return "unknown";
}
