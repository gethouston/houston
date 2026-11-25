import type { Agent, OrgMember } from "@houston/engine-adapter";
import { buildSharePeople } from "./agent-access-model.ts";

// WHY: Compare resolved rosters, not lengths: the broadest share is the empty array. ADR-0034
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
