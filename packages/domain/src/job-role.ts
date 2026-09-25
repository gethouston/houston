// Reached by its package subpath for the same reason as `job-description.ts`:
// the app's unit tests load this module under plain `node
// --experimental-strip-types`, where an extensionless relative import does not
// resolve.
import { parseJobDescription } from "@houston/domain/job-description";

/** The longest a typed industry or role may be, the same cap an agent's own name
 *  carries (`AGENT_NAME_MAX_LENGTH`): these are labels, and anything past one
 *  short line is a paste rather than an answer. */
export const AGENT_ROLE_PART_MAX_LENGTH = 64;

/**
 * A typed answer as it is HELD while the user is still writing it: the cap
 * alone, counted in CODE POINTS so a truncation never leaves half an emoji.
 * No trim and no whitespace collapse — both would fight the caret mid-word.
 *
 * Every write into the answer goes through here, including the ones that seed
 * the field from somewhere else (the filter's query becoming the answer), so a
 * pasted page can never reach the state by a door the field's own `maxLength`
 * does not guard.
 */
export function capRolePart(value: string): string {
  const points = [...value];
  if (points.length <= AGENT_ROLE_PART_MAX_LENGTH) return value;
  return points.slice(0, AGENT_ROLE_PART_MAX_LENGTH).join("");
}

/**
 * One answer (an industry or a role) as it is stored and shown. Invisible
 * formatting characters go first (a field of zero-width spaces is not an
 * answer, and stripping them after the trim would let one through as a
 * "filled in" answer), then whitespace collapses, then the cap.
 *
 * Every writer and reader of the two facts goes through here — the create
 * dialog, the Job description tab, and the host naming the role on the agent
 * listing — so an answer lands and reads in exactly one shape.
 */
export function normalizeRolePart(value: string): string {
  const cleaned = value
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return capRolePart(cleaned).trimEnd();
}

/**
 * The role an agent's job description names (its `role` field), normalized,
 * or `undefined` when the description is absent or names none. This is the
 * `role` the host serves on every agent in `GET /agents`, so a surface names
 * an agent's job without reading each agent's `CLAUDE.md`.
 */
export function jobDescriptionRole(
  instructions: string | null | undefined,
): string | undefined {
  if (!instructions) return undefined;
  const { role } = parseJobDescription(instructions).fields;
  return (role && normalizeRolePart(role)) || undefined;
}
