import type { AssistantEntityCollection } from "@houston/domain/assistant-catalog-types";
import type { EntityDirectory } from "./entity-directory";

interface Entry {
  id: string;
  name: string;
  email?: string;
}

/** Adapt the pinned directory's identity fields without losing display names. */
export async function directoryEntries(
  collection: Exclude<AssistantEntityCollection, "agents">,
  directory: EntityDirectory,
  scope: string,
): Promise<readonly Entry[]> {
  switch (collection) {
    case "teams":
      return directory.teams();
    case "workspaces":
      return directory.workspaces();
    case "members":
      return (await directory.members()).map((member) => ({
        ...member,
        id: member.userId,
      }));
    case "invites":
      return (await directory.invites()).map((invite) => ({
        ...invite,
        name: invite.email,
      }));
    case "routines":
      return directory.routines(scope);
    case "activities":
      return directory.activities(scope);
    case "skills":
      return (await directory.skills(scope)).map((skill) => ({
        ...skill,
        id: skill.slug,
      }));
    case "shared-skills":
      return (await directory.sharedSkills(scope)).map((skill) => ({
        ...skill,
        id: skill.slug,
      }));
  }
}
