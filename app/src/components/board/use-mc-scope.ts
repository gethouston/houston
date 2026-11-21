import type { KanbanItem } from "@houston-ai/board";
import { useMemo } from "react";
import type { Agent } from "../../lib/types";
import {
  agentsInScope,
  itemsInScope,
  resolveFilterPath,
} from "./mission-control-scope.ts";

export interface MissionControlScope {
  scopePaths?: string[];
  teamId?: string;
  filterPath?: string | null;
}

export interface McScope {
  scopedAgents: Agent[];
  paths: string[];
  agentFilteredItems: KanbanItem[];
  visibleAgents: Agent[];
  filterPath: string;
}

export function useMcScope(
  agents: Agent[],
  items: KanbanItem[],
  scope?: MissionControlScope,
): McScope {
  const scopePaths = scope?.scopePaths;
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
