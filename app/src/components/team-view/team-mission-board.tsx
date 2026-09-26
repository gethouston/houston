import type { ReactNode } from "react";
import type { Agent } from "../../lib/types";
import { MissionBoard } from "../board/mission-board";
import type { MissionControlScope } from "../board/use-mc-scope";
import { useMissionControlSource } from "../board/use-mission-control-source";

/**
 * One employee's active board. It receives the full roster for the shared
 * conversation sweep and a scope that renders only this employee's missions.
 */
export function TeamMissionBoard({
  agents,
  scope,
  modeToggle,
}: {
  /** The FULL workspace roster: the sweep spans it, the scope narrows what
   *  this board renders. */
  agents: Agent[];
  scope: MissionControlScope;
  modeToggle: ReactNode;
}) {
  const source = useMissionControlSource(agents, scope, modeToggle);
  return <MissionBoard source={source} />;
}
