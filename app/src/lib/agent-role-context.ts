import {
  composeJobDescription,
  normalizeRolePart,
  parseJobDescription,
} from "@houston/sdk/job-description";

export {
  AGENT_ROLE_PART_MAX_LENGTH,
  capRolePart,
  normalizeRolePart,
} from "@houston/sdk/job-description";

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

export function buildAgentRoleJobDescription(
  context: AgentRoleContext,
): string {
  return composeJobDescription({
    industry: context.context,
    role: context.role,
    body: "",
  });
}

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
