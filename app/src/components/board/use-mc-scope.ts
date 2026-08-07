import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useMemo, useState } from "react";
import type { Agent } from "../../lib/types";
import {
  agentsInScope,
  itemsInScope,
  resolveFilterPath,
} from "./mission-control-scope.ts";

/**
 * How a Mission Control board is narrowed and named. Omit it entirely and the
 * board is the global one: every agent, its own local agent filter, its own
 * title. That is what the Dashboard passes, so its behaviour is untouched by
 * the team-scoped board.
 */
export interface MissionControlScope {
  /** Restrict the board to these agent folder paths (one team's agents). */
  scopePaths?: string[];
  /** The board's title. A team names its board after the team. */
  title?: string;
  /** Identifies the team this board belongs to, for the per-team concerns that
   *  are not a matter of which cards show — today the new-mission draft scope
   *  (`missionControlDraftScope`). The global board omits it. */
  teamId?: string;
  /** Controlled agent filter: a folder path, or `null` for every agent in
   *  scope. Pair it with {@link onFilterPathChange}; the filter is local
   *  (uncontrolled) whenever the callback is absent. */
  filterPath?: string | null;
  /** Receives `null` for "all agents", else the picked agent's folder path. */
  onFilterPathChange?: (path: string | null) => void;
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
  setFilterPath: (path: string) => void;
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
  const onFilterPathChange = scope?.onFilterPathChange;
  const controlledFilterPath = scope?.filterPath;

  const [localFilterPath, setLocalFilterPath] = useState("");
  const filterPath = resolveFilterPath(
    onFilterPathChange ? (controlledFilterPath ?? "") : localFilterPath,
    scopePaths,
  );
  const setFilterPath = useCallback(
    (path: string) => {
      if (onFilterPathChange) onFilterPathChange(path || null);
      else setLocalFilterPath(path);
    },
    [onFilterPathChange],
  );

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
    setFilterPath,
  };
}
