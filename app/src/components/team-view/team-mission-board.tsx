import type { ReactNode } from "react";
import type { Agent } from "../../lib/types";
import { MissionBoard } from "../board/mission-board";
import type { MissionControlScope } from "../board/use-mc-scope";
import { useMissionControlSource } from "../board/use-mission-control-source";

export function TeamMissionBoard({
  agents,
  scope,
  modeToggle,
}: {
  agents: Agent[];
  scope: MissionControlScope;
  modeToggle: ReactNode;
}) {
  const source = useMissionControlSource(agents, scope, modeToggle);
  return <MissionBoard source={source} />;
}
