import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

/**
 * The query keys a FINISHED turn may have invalidated for one agent (HOU-644).
 *
 * Cloud has NO file watcher and no post-turn sync diff, so a running agent that
 * writes its own CLAUDE.md / skills / learnings / files mid-turn never fires a
 * `*Changed` event. A finished turn is the one reliable signal that the agent
 * may have edited these surfaces, so they are refetched for that agent — cheap
 * (only the mounted ones actually re-read), and it saves the user from
 * remounting the screen to see self-authored changes. On desktop this is
 * harmless redundancy with the FS watcher.
 */
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
