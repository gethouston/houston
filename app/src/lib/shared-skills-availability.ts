// The "does this deployment run shared skills at all?" classifier. Dependency-
// free so it is node-testable directly (app/tests/shared-skills-availability.test.ts)
// and importable from anywhere.
//
// Sibling of `network-transport-error.ts` and `missing-skill.ts`: a small,
// typed predicate over an engine error shape, used to decide how a failure is
// SURFACED — never to decide whether it is reported.

/**
 * The gateway's word for "no blob store is bound to this deployment, so there
 * is no workspace skill store" (`cloud/internal/edge/shared_skills_routes.go`,
 * `sharedSkillsNotConfigured`). It answers `503 {"error": <this>}` for every
 * shared-skills route.
 *
 * The gateway's `/v1/capabilities` cannot be used to gate the call instead: it
 * reports `sharedSkills: true` unconditionally, independent of whether the
 * blob store is actually bound, so the 503 body is the only honest signal the
 * client gets. (Fixing the capability flag is a gateway change; until then the
 * client must read the wire.)
 */
export const SHARED_SKILLS_UNCONFIGURED = "shared skills not configured";

/**
 * True when a shared-skills call failed because the deployment does not run
 * shared skills.
 *
 * This is feature ABSENCE, not failure: nothing broke, nothing is retryable,
 * and there is no bug to report. The Skills surfaces render their empty state
 * and the polling stops, instead of a red "Houston, we have a problem!" toast
 * re-firing every time a Skills view mounts (HOU-1153). Every OTHER shared-
 * skills failure — a real 5xx, an auth rejection, a malformed answer — is
 * rethrown and toasts exactly as before, so the no-silent-failures policy
 * holds.
 *
 * Keys on the structural `.status` + body the `HoustonEngineError` carries,
 * never on the rendered message string.
 */
export function isSharedSkillsUnconfiguredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; body?: unknown };
  if (e.status !== 503) return false;
  const body = e.body as { error?: unknown } | null;
  return body?.error === SHARED_SKILLS_UNCONFIGURED;
}

/**
 * Whether a shared-skills surface should render at all.
 *
 * Two signals, and the store's own answer is the last word: the gateway
 * reports `capabilities.sharedSkills: true` unconditionally, so `advertised`
 * alone would render a workspace-store section that can never hold anything.
 * `configured: false` — the typed answer `tauriSharedSkills.list` returns for
 * a deployment with no store — hides it instead.
 *
 * While the list is still loading (`undefined`) the surface stays available:
 * the optimistic default keeps the section from flickering out and back in on
 * every deployment that DOES serve the store.
 */
export function sharedSkillsAvailable(
  advertised: boolean,
  list: { configured: boolean } | undefined,
): boolean {
  return advertised && list?.configured !== false;
}
