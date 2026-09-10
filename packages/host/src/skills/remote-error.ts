/**
 * Typed failures for the community/repo skill routes. `kind` is the stable
 * machine-readable tag the frontend matches on to render plain-English copy —
 * keep the values in sync with `ui/skills/src/skill-error-kinds.ts`.
 */

export type SkillRemoteErrorKind =
  | "rate_limited"
  /** The upstream never answered: a transport failure on the way out. */
  | "offline"
  /** The upstream did not answer within the request budget (PRODUCT-1728).
   *  Its own state, not `offline`: the copy differs ("slow", not "check your
   *  internet") and the client treats it as expected weather. */
  | "upstream_timeout"
  /** The upstream answered, but with a non-OK status or an unparseable body.
   *  Kept apart from the transport kinds so a real skills.sh 500 (or a schema
   *  change) stays loud in Sentry while slowness and outages stay quiet. */
  | "upstream_error"
  | "skill_not_in_repo"
  | "invalid_repo_source"
  | "repo_private"
  | "repo_not_found"
  | "repo_no_skills"
  | "github_rate_limited"
  | "validation";

const HTTP_STATUS: Record<SkillRemoteErrorKind, number> = {
  rate_limited: 429,
  offline: 503,
  upstream_timeout: 504,
  upstream_error: 502,
  skill_not_in_repo: 404,
  invalid_repo_source: 400,
  repo_private: 403,
  repo_not_found: 404,
  repo_no_skills: 404,
  github_rate_limited: 429,
  validation: 400,
};

export class SkillRemoteError extends Error {
  readonly kind: SkillRemoteErrorKind;

  constructor(kind: SkillRemoteErrorKind, message: string) {
    super(message);
    this.name = "SkillRemoteError";
    this.kind = kind;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.kind];
  }
}
