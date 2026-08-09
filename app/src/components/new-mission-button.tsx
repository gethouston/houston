import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { shortcutLabel } from "../lib/shortcuts";
import type { Agent } from "../lib/types";
import { AgentCardAvatar } from "./shell/agent-card-avatar";
import { tourAnchor } from "./shell/workspace-tour-steps.ts";

/**
 * "New task" — a board section's PRIMARY action, and the only filled control
 * on the screen.
 *
 * It sits in the section's own row-2 tools rather than on the team strip,
 * because it belongs to the page and not to the frame. `size="sm"` puts it at
 * exactly the strip's lozenge height (32px) with a full radius, so the right
 * zone reads as one row of Safari capsules. It keeps its LABEL — an icon-only
 * primary action would make the single most important control on the screen
 * the one you have to hover to identify.
 *
 * **It answers "whose task?" in place.** A board pinned to one agent, or a
 * team with one agent, opens that composer straight away and the menu never
 * appears; an ambiguous board drops a menu of the board's agents right under
 * the button (16px helmet + name, the same idiom as the agent filter capsule
 * beside it). The rule is `board/new-mission-target.ts`; this component only
 * draws it, and the OPEN state is the caller's so the keyboard shortcut walks
 * exactly the same path a click does.
 */
export function NewMissionButton({
  agents,
  menuOpen,
  onMenuOpenChange,
  onPick,
}: {
  /** The board's agents — the menu's roster. */
  agents: Agent[];
  /** Controlled by the caller, which decides whether a menu is needed at all. */
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onPick: (agent: Agent) => void;
}) {
  const { t } = useTranslation("dashboard");
  const label = t("empty.newMission");

  return (
    <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* The trigger's own click IS the request: the caller turns it into
              a direct open or a menu, so there is never a frame where a menu
              opens for a board that has nothing to ask. */}
          <DropdownMenuTrigger asChild>
            <Button
              {...tourAnchor("newMission")}
              size="sm"
              className="gap-1.5 rounded-full"
              aria-label={label}
            >
              <SquarePen className="size-4" />
              {label}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {shortcutLabel("newMission")}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            className="gap-2"
            onClick={() => onPick(agent)}
          >
            <AgentCardAvatar color={agent.color} />
            {agent.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
