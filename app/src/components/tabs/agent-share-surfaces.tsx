import type { Agent } from "../../lib/types";
import type { AgentShareSurface } from "./agent-access-model";
import { AgentShareDialog } from "./agent-share-dialog";
import { AgentSharePeopleDialog } from "./agent-share-people-dialog";
import { ShareViaTeamFlow } from "./share-via-team-flow";

/**
 * Maps a resolved {@link AgentShareSurface} to the one flow that owns it. The
 * SINGLE place the share surface -> dialog wiring lives, so the prominent header
 * Share button and the buried Agent-settings block open the exact same
 * implementation and can never diverge. Callers own their own trigger + open
 * state; this renders nothing for `"none"`.
 */
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
