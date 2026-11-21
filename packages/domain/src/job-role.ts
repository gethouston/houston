import { parseJobDescription } from "@houston/domain/job-description";

export const AGENT_ROLE_PART_MAX_LENGTH = 64;

export function capRolePart(value: string): string {
  const points = [...value];
  if (points.length <= AGENT_ROLE_PART_MAX_LENGTH) return value;
  return points.slice(0, AGENT_ROLE_PART_MAX_LENGTH).join("");
}

export function normalizeRolePart(value: string): string {
  const cleaned = value
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return capRolePart(cleaned).trimEnd();
}

export function jobDescriptionRole(
  instructions: string | null | undefined,
): string | undefined {
  if (!instructions) return undefined;
  const { role } = parseJobDescription(instructions).fields;
  return (role && normalizeRolePart(role)) || undefined;
}
