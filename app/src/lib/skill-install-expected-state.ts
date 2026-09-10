/**
 * A community skill install that failed because the skill no longer exists
 * where skills.sh says it does: the author removed or renamed it
 * (`skill_not_in_repo`, proven by the host's full repo scan) or deleted the
 * repo (`repo_not_found`, GitHub's 404). skills.sh keeps indexing both for
 * months, so users hit these on cards they did nothing wrong with; the install
 * handler shows the expected-state copy and drops the card, so the engine-call
 * layer logs it and stops there: no red toast, no Sentry issue (PRODUCT-1729,
 * HOUSTON-APP-5D7 / 5CS). Rate limits, offline, and untyped failures stay loud.
 *
 * Dependency-free (the typed `kind` is read here, not via `@houston-ai/skills`,
 * whose root barrel the app's node:test runner cannot load) so it is testable
 * directly (app/tests/skill-install-expected-state.test.ts).
 */
export function isUnavailableSkillError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("kind" in err)) return false;
  const kind = (err as { kind?: unknown }).kind;
  return kind === "skill_not_in_repo" || kind === "repo_not_found";
}

/**
 * A community skill PREVIEW that failed for a reason outside Houston: the skill
 * or repo is gone (above), or GitHub could not be listed right now (the
 * unauthenticated `api.github.com` quota, `github_rate_limited`, or a
 * transport drop, `offline`). The detail modal renders its visible error state
 * either way (use-skill-preview.ts), and a card click is not worth a Sentry
 * issue for weather. The INSTALL path deliberately keeps rate limits and
 * offline loud: that is a user-initiated write with its own retry copy.
 */
export function isExpectedSkillPreviewError(err: unknown): boolean {
  if (isUnavailableSkillError(err)) return true;
  if (!err || typeof err !== "object" || !("kind" in err)) return false;
  const kind = (err as { kind?: unknown }).kind;
  return kind === "github_rate_limited" || kind === "offline";
}
