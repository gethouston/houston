/**
 * Typed failures for the community/repo skill routes. `kind` is the stable
 * machine-readable tag the frontend matches on to render plain-English copy —
 * keep the values in sync with `ui/skills/src/skill-error-kinds.ts` (the same
 * taxonomy the legacy Rust engine emits, so both engines read identically).
 */

export type SkillRemoteErrorKind =
  | "rate_limited"
  | "offline"
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
