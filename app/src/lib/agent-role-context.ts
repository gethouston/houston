import {
  composeJobDescription,
  parseJobDescription,
} from "@houston/sdk/job-description";

/** The brief a new agent is created with: the industry it works in and the job
 *  it fills, both as the user reads them (a translated catalog label, or their
 *  own words). */
export interface AgentRoleContext {
  context: string;
  role: string;
}

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
 * One typed answer as it is stored. Invisible formatting characters go first
 * (a field of zero-width spaces is not an answer, and stripping them after the
 * trim would let one through as a "filled in" answer), then whitespace
 * collapses, then the cap.
 *
 * Exported because two surfaces collect these answers: the create dialog asks
 * for them, and the Job description tab edits the same two facts later. An
 * answer given in either must land in the file in exactly the same shape.
 */
export function normalizeRolePart(value: string): string {
  const cleaned = value
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return capRolePart(cleaned).trimEnd();
}

export function createAgentRoleContext(input: {
  context: string;
  role: string;
}): AgentRoleContext | null {
  const context = normalizeRolePart(input.context);
  const role = normalizeRolePart(input.role);
  return context && role ? { context, role } : null;
}

/**
 * The brief an ALREADY WRITTEN job description carries, for an agent that
 * arrives with one instead of with answers (an import). Both facts or neither:
 * the role sentence names the job in the industry it is done in, and half a
 * brief is not one.
 *
 * Reading it at the source is what keeps the three places that name the job in
 * agreement — the creation record, the hidden setup prompt, and the derivation
 * that takes over once the record expires (`setup-hello.ts`), which reads this
 * same description.
 */
export function jobDescriptionRoleContext(
  instructions: string | undefined,
): AgentRoleContext | undefined {
  if (!instructions) return undefined;
  const { industry, role } = parseJobDescription(instructions).fields;
  return (
    createAgentRoleContext({ context: industry ?? "", role: role ?? "" }) ??
    undefined
  );
}

/**
 * The job description a new agent is created with: the two answered facts and
 * NOTHING else. The description below them is the agent's and the user's to
 * write — seeding it with prose we invented would put words in the agent's
 * mouth that neither of them chose, and give the Job description tab a page of
 * filler to delete before the first real line.
 */
export function buildAgentRoleJobDescription(
  context: AgentRoleContext,
): string {
  return composeJobDescription({
    industry: context.context,
    role: context.role,
    body: "",
  });
}
