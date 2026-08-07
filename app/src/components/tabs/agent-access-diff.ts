import type { Agent, OrgMember } from "@houston-ai/engine-client";
import { buildSharePeople } from "./agent-access-model.ts";

/**
 * Did an assignment write actually WIDEN who can reach the agent? Pure and
 * DOM-free so the rule is unit-tested away from the mutation.
 *
 * Comparing raw `assignments` lengths is not the same question. The everyone
 * sentinel is the EMPTY array, so the broadest share in the product looks like
 * a shrink, and materializing that sentinel into today's roster (which grants
 * nobody anything new) looks like a share. Both are answered correctly by
 * comparing the RESOLVED rosters {@link buildSharePeople} produces — sentinel
 * expanded to the whole team, org owner always present — and asking whether
 * anyone appears in the new one who was not in the old.
 *
 * Access LEVEL changes (Can use ↔ Manager) are deliberately not widening: the
 * `agent_shared` event answers "did more people get this agent", and a
 * promotion within the existing roster is a different act.
 */
export function accessWidened(input: {
  before: Pick<Agent, "assignments" | "assignedUserIds">;
  after: Pick<Agent, "assignments" | "assignedUserIds">;
  members: readonly OrgMember[];
}): boolean {
  const had = new Set(
    buildSharePeople({
      agent: input.before,
      members: input.members,
      selfId: null,
    }).map((person) => person.userId),
  );
  return buildSharePeople({
    agent: input.after,
    members: input.members,
    selfId: null,
  }).some((person) => !had.has(person.userId));
}
