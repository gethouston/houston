/**
 * A community skill search that failed for a reason outside Houston: skills.sh
 * took longer than the host's budget (`upstream_timeout`), could not be reached
 * at all (`offline`), or is rate limiting (`rate_limited`). The marketplace
 * renders each one inline with its own copy (`searchErrorPhase`), so the
 * engine-call layer logs it and stops there: no red toast, no Sentry issue.
 * skills.sh being slow was the third most frequent "error" on 0.6.17 to 0.6.20
 * (PRODUCT-1728) and nothing in Houston had broken.
 *
 * `upstream_error` is NOT here on purpose: a real 500 or an unparseable body
 * from skills.sh is a fault we want to hear about, and it stays loud.
 *
 * Dependency-free (the typed `kind` is read here, not via `@houston-ai/skills`,
 * whose root barrel the app's node:test runner cannot load) so it is testable
 * directly (app/tests/skill-search-expected-state.test.ts).
 */
export function isExpectedSkillSearchError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("kind" in err)) return false;
  const kind = (err as { kind?: unknown }).kind;
  return (
    kind === "upstream_timeout" || kind === "offline" || kind === "rate_limited"
  );
}
