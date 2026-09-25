import {
  composeJobDescription,
  normalizeRolePart,
  parseJobDescription,
} from "@houston/sdk/job-description";

// The answer grammar (cap + normalization) lives once, in `@houston/domain`,
// because the host reads the same role back off every job description to
// name it on the agent listing.
export {
  AGENT_ROLE_PART_MAX_LENGTH,
  capRolePart,
  normalizeRolePart,
} from "@houston/sdk/job-description";

/** The brief a new agent is created with: the industry it works in and the job
 *  it fills, both as the user reads them (a translated catalog label, or their
 *  own words). */
export interface AgentRoleContext {
  context: string;
  role: string;
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

/**
 * A job description with its brief answered again: the block the create wrote
 * ({@link buildAgentRoleJobDescription}) takes the new facts, and everything
 * else (the description below it, any key the agent keeps for itself) stays
 * exactly as it stands. An agent with no block gains one.
 */
export function withAgentRoleContext(
  instructions: string,
  context: AgentRoleContext,
): string {
  const { fields, body } = parseJobDescription(instructions);
  return composeJobDescription(
    {
      ...fields,
      industry: normalizeRolePart(context.context),
      role: normalizeRolePart(context.role),
      body,
    },
    instructions,
  );
}
