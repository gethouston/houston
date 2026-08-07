import type { KanbanItem } from "@houston-ai/board";

/**
 * The pure scoping rules of a Mission Control board, split out so they are
 * unit-testable without a React tree (`app/tests/mission-control-scope.test.ts`).
 *
 * `scopePaths === undefined` means "every agent in the workspace" — the global
 * Mission Control. An ARRAY (an empty one included) means "only these agent
 * folder paths" — one team's board. The distinction matters: the cross-agent
 * sweep still spans the full roster either way, so every team reads the one
 * warm `all-conversations` query instead of starting its own for its slice.
 */

/** Whether a folder path belongs to the board's scope (no scope = everything). */
export function inScope(
  folderPath: string | undefined,
  scopePaths: string[] | undefined,
): boolean {
  if (scopePaths === undefined) return true;
  return folderPath !== undefined && scopePaths.includes(folderPath);
}

/** The agents a scoped board offers (filter menu, new-mission picker, actions). */
export function agentsInScope<T extends { folderPath: string }>(
  agents: T[],
  scopePaths: string[] | undefined,
): T[] {
  if (scopePaths === undefined) return agents;
  return agents.filter((agent) => inScope(agent.folderPath, scopePaths));
}

/** The board items a scoped board shows, keyed off each card's owning agent. */
export function itemsInScope(
  items: KanbanItem[],
  scopePaths: string[] | undefined,
): KanbanItem[] {
  if (scopePaths === undefined) return items;
  return items.filter((item) =>
    inScope(item.metadata?.agentPath as string | undefined, scopePaths),
  );
}

/** The bare scope the GLOBAL Mission Control board's new-mission draft lives under. */
export const GLOBAL_MISSION_DRAFT_SCOPE = "mission-control";

/**
 * The draft scope a board's new-mission composer saves under. The global board
 * keeps the bare scope (unchanged behaviour, and unchanged stored drafts); a
 * team board gets its own, so a first message parked on one team's board never
 * surfaces in another team's composer.
 */
export function missionControlDraftScope(teamId?: string): string {
  return teamId
    ? `${GLOBAL_MISSION_DRAFT_SCOPE}:${teamId}`
    : GLOBAL_MISSION_DRAFT_SCOPE;
}

/**
 * The agent filter the board actually applies. A filter pointing outside the
 * scope (the agent was dragged to another team while its board was open)
 * resolves to "every agent" rather than an empty board whose filter menu no
 * longer lists the agent that emptied it.
 */
export function resolveFilterPath(
  filterPath: string,
  scopePaths: string[] | undefined,
): string {
  if (!filterPath) return "";
  return inScope(filterPath, scopePaths) ? filterPath : "";
}
