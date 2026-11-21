import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

export function postTurnAgentKeys(agentPath: string): QueryKey[] {
  return [
    queryKeys.instructions(agentPath),
    queryKeys.workspaceContext(agentPath),
    queryKeys.files(agentPath),
    queryKeys.skills(agentPath),
    queryKeys.skillsManifest(agentPath),
    ["skill-detail", agentPath],
    queryKeys.learnings(agentPath),
    queryKeys.config(agentPath),
    queryKeys.routines(agentPath),
  ];
}
