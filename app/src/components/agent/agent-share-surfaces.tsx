import type { Agent } from "../../lib/types";
import type { AgentShareSurface } from "./agent-access-model";
import { AgentShareDialog } from "./agent-share-dialog";
import { AgentSharePeopleDialog } from "./agent-share-people-dialog";
import { ShareViaTeamFlow } from "./share-via-team-flow";

export function AgentShareSurfaces({
  agent,
  surface,
  open,
  onOpenChange,
}: {
  agent: Agent;
  surface: AgentShareSurface;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (surface === "inviteTeam") {
    return (
      <ShareViaTeamFlow agent={agent} open={open} onOpenChange={onOpenChange} />
    );
  }
  if (surface === "manage") {
    return (
      <AgentShareDialog agent={agent} open={open} onOpenChange={onOpenChange} />
    );
  }
  if (surface === "view") {
    return (
      <AgentSharePeopleDialog
        agent={agent}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }
  return null;
}
