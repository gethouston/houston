/**
 * Subpath re-export of the job-description grammar
 * (`@houston/sdk/job-description`).
 *
 * `CLAUDE.md` is read by three parties — the app's Job description tab, the
 * agent itself, and the runtime that renders the file into the prompt — so the
 * grammar lives once in `@houston/domain` and surfaces reach it from here.
 *
 * The main barrel re-exports these too, but this subpath is what surface code
 * should import: it stays loadable under plain `node
 * --experimental-strip-types` (app unit tests), where the barrels'
 * extensionless internal imports do not resolve.
 */
export {
  composeJobDescription,
  type JobDescriptionFields,
  type ParsedJobDescription,
  parseJobDescription,
} from "@houston/domain/job-description";
export {
  AGENT_ROLE_PART_MAX_LENGTH,
  capRolePart,
  jobDescriptionRole,
  normalizeRolePart,
} from "@houston/domain/job-role";
