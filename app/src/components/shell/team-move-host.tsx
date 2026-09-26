import { useUIStore } from "../../stores/ui";
import { TeamMoveFlow } from "../team-view/team-move-flow";

export function TeamMoveHost() {
  const source = useUIStore((state) => state.teamMoveSource);
  const closeTeamMove = useUIStore((state) => state.closeTeamMove);

  if (!source) return null;

  return (
    <TeamMoveFlow
      source={source}
      open
      onOpenChange={(open) => {
        if (!open) closeTeamMove();
      }}
    />
  );
}
