import type { KanbanItem } from "@houston-ai/board";

export function inScope(
  folderPath: string | undefined,
  scopePaths: string[] | undefined,
): boolean {
  if (scopePaths === undefined) return true;
  return folderPath !== undefined && scopePaths.includes(folderPath);
}

export function agentsInScope<T extends { folderPath: string }>(
  agents: T[],
  scopePaths: string[] | undefined,
): T[] {
  if (scopePaths === undefined) return agents;
  return agents.filter((agent) => inScope(agent.folderPath, scopePaths));
}

export function itemsInScope(
  items: KanbanItem[],
  scopePaths: string[] | undefined,
): KanbanItem[] {
  if (scopePaths === undefined) return items;
  return items.filter((item) =>
    inScope(item.metadata?.agentPath as string | undefined, scopePaths),
  );
}

export const GLOBAL_MISSION_DRAFT_SCOPE = "mission-control";

export function missionControlDraftScope(teamId?: string): string {
  return teamId
    ? `${GLOBAL_MISSION_DRAFT_SCOPE}:${teamId}`
    : GLOBAL_MISSION_DRAFT_SCOPE;
}

export function resolveFilterPath(
  filterPath: string,
  scopePaths: string[] | undefined,
): string {
  if (!filterPath) return "";
  return inScope(filterPath, scopePaths) ? filterPath : "";
}

export function filteredScopeAgent<T extends { folderPath: string }>(
  agents: T[],
  filterPath: string,
): T | null {
  if (!filterPath) return null;
  return agents.find((agent) => agent.folderPath === filterPath) ?? null;
}
