/**
 * A skill the user opened can no longer be resolved on disk — renamed,
 * deleted, or never installed. The engine reports this with a stable
 * `skill_not_found` error kind (see `SkillError::NotFound` ->
 * `CoreError::Labeled` in `engine/houston-engine-core/src/skills.rs`).
 *
 * This is an expected, explainable state, NOT a Houston bug: the Skills view
 * surfaces it inline and refreshes the list. We use it to keep the red
 * "we have a problem" bug toast + Sentry report off the missing-skill path
 * (HOU-441) while still surfacing a clear message.
 */
export const MISSING_SKILL_KIND = "skill_not_found";

/**
 * True when a thrown engine error means the referenced skill is gone. Reads
 * the typed `.kind` exposed by `HoustonEngineError` (and tolerates a plain
 * `{ kind }` object), so it never depends on parsing message strings.
 */
export function isMissingSkillError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "kind" in err &&
    (err as { kind?: unknown }).kind === MISSING_SKILL_KIND
  );
}
