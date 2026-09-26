import type { Capabilities, OrgSummary } from "@houston/engine-adapter";
import { isAgentManager } from "./agent-access.ts";
import { ownableTeams } from "./share-via-team.ts";

export function canMoveFolderToSpace(
  personalSpace: boolean,
  capabilities: Capabilities | null,
  agents: readonly { access?: "manager" | "user" }[],
  destinations: readonly OrgSummary[],
): boolean {
  return (
    personalSpace &&
    capabilities?.spaces === true &&
    agents.every((agent) => isAgentManager(capabilities, agent)) &&
    ownableTeams(destinations).length > 0
  );
}
