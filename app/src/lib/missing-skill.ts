/**
 * A skill the user opened can no longer be resolved on disk — renamed,
 * deleted, or never installed. The host's `GET /v1/skills/<slug>` route answers
 * `404 { error: "skill not found" }` (packages/host/src/routes/skills.ts),
 * surfaced by `@houston-ai/engine-client` as a `HoustonEngineError` whose
 * `.status` is 404.
 *
 * Unlike the legacy Rust engine, the TS host emits bare-string error bodies, so
 * there is NO typed `.kind` on this error (`HoustonEngineError.kind` reads
 * `body.error.details.kind`, which the host never sets). We therefore key off
 * the HTTP status. This classifier is only ever applied to the load-skill call
 * (see `tauriSkills.load` and `useSkillSurface`), and a skill GET has exactly
 * one 404 path — the skill is gone — so the status is unambiguous in context. A
 * typed `kind` is still tolerated so the classifier keeps working if the host's
 * error envelope is ever upgraded to carry one (as the legacy Rust engine did
 * via `SkillError::NotFound` -> `CoreError::Labeled`).
 *
 * A missing skill is an expected, explainable state, NOT a Houston bug:
 * `tauriSkills.load` tags it so it skips the red "we have a problem" bug toast +
 * Sentry report (HOU-515 / HOU-441), while `useSkillSurface` surfaces it inline
 * (a calm info toast, clears the stale selection, and refetches the list so the
 * dead card vanishes).
 */
export const MISSING_SKILL_KIND = "skill_not_found";

/**
 * True when a thrown engine error means the referenced skill is gone. Reads the
 * structural `.status` exposed by `HoustonEngineError` (and tolerates a plain
 * `{ status }` / `{ kind }` object), so it never depends on parsing message
 * strings.
 */
export function isMissingSkillError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; kind?: unknown };
  // Primary signal: the engine-client HoustonEngineError for a 404 skill GET.
  if (e.status === 404) return true;
  // Forward-compat / legacy Rust engine: a typed kind, should the host emit one.
  return e.kind === MISSING_SKILL_KIND;
}
