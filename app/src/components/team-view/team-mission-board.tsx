import type { Agent } from "../../lib/types";
import { MissionBoard } from "../board/mission-board";
import type { MissionControlScope } from "../board/use-mc-scope.ts";
import { useMissionControlSource } from "../board/use-mission-control-source";

/**
 * One team's active mission board: the same board Mission Control renders,
 * narrowed to the team's agents by the shared `MissionControlScope`
 * (`useTeamBoardScope`). The agent filter inside that scope is CONTROLLED by
 * the store, so clicking an agent row in the sidebar and picking one from the
 * board's own filter menu are the same act.
 *
 * The source is handed the FULL agent roster and told which slice to show, so
 * every team reads the one cross-agent sweep rather than starting its own.
 *
 * No `isActive` prop: this board is the whole of a kept-alive top-level screen
 * (not one tab among several), so it rides `MissionBoard`'s own
 * `useIsActiveView` screen signal to release the shell detail panel when the
 * team view hides (HOU-1165). That covers the ACTIVE board only; the team's
 * archive carries its own release, in `MissionControlArchived`.
 */
export function TeamMissionBoard({
  agents,
  scope,
  onShowArchived,
}: {
  /** The FULL workspace roster: the sweep spans it, the scope narrows what
   *  this board renders. */
  agents: Agent[];
  scope: MissionControlScope;
  onShowArchived: () => void;
}) {
  const source = useMissionControlSource(
    agents,
    onShowArchived,
    undefined,
    scope,
  );
  return <MissionBoard source={source} />;
}
