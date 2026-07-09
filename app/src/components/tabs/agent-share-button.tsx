import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isTeamWorkspace } from "../../lib/space-id";
import type { Agent } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import { agentShareSurface } from "./agent-access-model";
import { AgentShareSurfaces } from "./agent-share-surfaces";

/**
 * The prominent, always-visible Share button in the per-agent view header
 * (Google Docs discoverability). Which surface it opens is decided once by
 * {@link agentShareSurface}: `inviteTeam` (personal space -> move into a team),
 * `manage` (team space, agent-manager -> the Drive-style dialog), or `view`
 * (team space, plain member -> read-only who-has-access). Single-player / no
 * multiplayer resolves to `none` and the button does not render. Opens the same
 * flows as the buried Agent-settings block via {@link AgentShareSurfaces}.
 *
 * `collapsed` renders icon-only (label as tooltip) for the tight header state
 * when the mission panel is open, matching the sibling action buttons.
 */
export function AgentShareButton({
  agent,
  collapsed,
}: {
  agent: Agent;
  collapsed?: boolean;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const inPersonalSpace = !isTeamWorkspace(current?.id ?? "");
  const surface = agentShareSurface(capabilities, agent, inPersonalSpace);
  const [open, setOpen] = useState(false);

  if (surface === "none") return null;

  const label =
    surface === "inviteTeam"
      ? t("shareViaTeam.button")
      : surface === "view"
        ? t("share.viewButton")
        : t("share.button");
  const Icon = surface === "view" ? Users : UserPlus;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-tour-target="shareAgent"
            variant="secondary"
            size={collapsed ? "icon" : "default"}
            className="rounded-full"
            onClick={() => setOpen(true)}
            aria-label={label}
          >
            <Icon className="size-4" />
            {!collapsed && label}
          </Button>
        </TooltipTrigger>
        {collapsed && <TooltipContent side="bottom">{label}</TooltipContent>}
      </Tooltip>
      <AgentShareSurfaces
        agent={agent}
        surface={surface}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
