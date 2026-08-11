import type { KanbanItem } from "@houston-ai/board";
import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import {
  agentsInScope,
  itemsInScope,
  resolveFilterPath,
} from "./mission-control-scope.ts";

/**
 * How a Mission Control board is narrowed. Every board on screen is a team's,
 * so every live caller passes one; omitting it leaves an unnarrowed board over
 * the whole roster, which nothing renders today.
 *
 * It carries no TITLE: the team screen's row 1 names the team above every one
 * of its sections, so a board that named itself again would print the same
 * words twice on one screen.
 */
export interface MissionControlScope {
  /** Restrict the board to these agent folder paths (one team's agents). */
  scopePaths?: string[];
  /** Identifies the team this board belongs to, for the per-team concerns that
   *  are not a matter of which cards show — today the new-mission draft scope
   *  (`missionControlDraftScope`). The global board omits it. */
  teamId?: string;
  /** The agent filter this board renders under: a folder path, or `null` for
   *  every agent in scope. Always owned by the surface that holds the pin (the
   *  team strip's breadcrumb, the archive's own dropdown), which is why the
   *  scope carries no setter: a board renders the filter, it never writes it. */
  filterPath?: string | null;
}

export interface McScope {
  /** The agents this board offers: filter menu, new-mission picker, actions. */
  scopedAgents: Agent[];
  /** Their folder paths, for the per-agent action + selection routing. */
  paths: string[];
  /** Scoped items with the agent filter applied. */
  agentFilteredItems: KanbanItem[];
  /** The agents the current filter leaves visible (drives the empty auto-open). */
  visibleAgents: Agent[];
  /** The applied filter, `""` for "every agent in scope". */
  filterPath: string;
}

/**
 * The scope half of {@link useMissionControlSource}: which agents and cards a
 * board covers, and the agent filter over them. Separated from the source so
 * the "one team's slice of the cross-agent sweep" rules live in one small unit
 * (with pure helpers behind them) instead of thickening the source hook.
 */
export function useMcScope(
  agents: Agent[],
  items: KanbanItem[],
  scope?: MissionControlScope,
): McScope {
  const scopePaths = scope?.scopePaths;
  // Read-only: nothing on a board changes the filter any more (the team strip's
  // breadcrumb and the archive's dropdown write their own source directly), so
  // the applied filter is exactly what the scope says, narrowed to the scope.
  const filterPath = resolveFilterPath(scope?.filterPath ?? "", scopePaths);

  const scopedAgents = useMemo(
    () => agentsInScope(agents, scopePaths),
    [agents, scopePaths],
  );
  const paths = useMemo(
    () => scopedAgents.map((a) => a.folderPath),
    [scopedAgents],
  );
  const agentFilteredItems = useMemo(() => {
    const scoped = itemsInScope(items, scopePaths);
    return filterPath
      ? scoped.filter((i) => i.metadata?.agentPath === filterPath)
      : scoped;
  }, [items, scopePaths, filterPath]);
  const visibleAgents = useMemo(
    () =>
      filterPath
        ? scopedAgents.filter((a) => a.folderPath === filterPath)
        : scopedAgents,
    [scopedAgents, filterPath],
  );

  return {
    scopedAgents,
    paths,
    agentFilteredItems,
    visibleAgents,
    filterPath,
  };
}
