import type { KanbanItem } from "@houston-ai/board";
import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import {
  agentsInScope,
  itemsInScope,
  resolveFilterPath,
} from "./mission-control-scope.ts";

/**
 * How a Tasks board is narrowed to an employee or a group of employees.
 */
export interface MissionControlScope {
  /** Restrict the board to these agent folder paths. */
  scopePaths?: string[];
  /** Identifies the source group for new-mission draft scope. */
  teamId?: string;
  /** The agent filter this board renders under: a folder path, or `null` for
   *  every agent in scope. Always owned by the surface that holds the pin (the
   *  employee screen or archive), which is why the
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
 * the scoped slice of the cross-agent sweep lives in one small unit
 * (with pure helpers behind them) instead of thickening the source hook.
 */
export function useMcScope(
  agents: Agent[],
  items: KanbanItem[],
  scope?: MissionControlScope,
): McScope {
  const scopePaths = scope?.scopePaths;
  // Read-only: the employee screen and archive write their own source, so
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
