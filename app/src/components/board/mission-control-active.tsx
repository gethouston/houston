import type { Agent } from "../../lib/types";
import { MissionBoard } from "./mission-board";
import { useMissionControlSource } from "./use-mission-control-source";

/**
 * Mission Control's active board. A thin wrapper so its source hooks (which
 * register the global "New mission" handler, keyboard nav, etc.) only run
 * while the active view is mounted — `Dashboard` swaps it out for the Archived
 * view rather than hiding it, so nothing lingers behind the archived list.
 */
export function MissionControlActive({
  agents,
  onShowArchived,
}: {
  agents: Agent[];
  onShowArchived: () => void;
}) {
  const source = useMissionControlSource(agents, onShowArchived);
  return <MissionBoard source={source} />;
}
