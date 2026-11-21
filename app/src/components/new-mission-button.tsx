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

export function NewMissionButton({
  agents,
  menuOpen,
  onMenuOpenChange,
  onPick,
  disabled = false,
}: {
  agents: Agent[];
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onPick: (agent: Agent) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const label = t("empty.newMission");

  return (
    <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              {...tourAnchor("newMission")}
              size="sm"
              className="gap-1.5 rounded-full"
              aria-label={label}
              disabled={disabled}
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
