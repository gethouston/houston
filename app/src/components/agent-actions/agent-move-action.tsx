import {
  ConfirmDialog,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { TeamGlyph } from "../shell/team-glyph";
import { moveTargetTeams } from "../team-view/move-agent-model";

export function AgentMoveMenuItem({
  teams,
  currentTeamId,
  onSelect,
}: {
  teams: readonly TeamView[];
  currentTeamId: string;
  onSelect: (team: TeamView) => void;
}) {
  const { t } = useTranslation("teams");
  const targets = moveTargetTeams(teams, currentTeamId);
  if (targets.length === 0) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        {t("teamView.move.action")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {targets.map((team) => (
          <DropdownMenuItem
            key={team.id}
            className="gap-2"
            onSelect={() => onSelect(team)}
          >
            <TeamGlyph team={team} className="size-4 shrink-0" />
            <span className="truncate">{team.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function AgentMoveDialog({
  agent,
  team,
  onOpenChange,
  onConfirm,
}: {
  agent: Agent;
  team: TeamView | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <ConfirmDialog
      open={team !== null}
      onOpenChange={onOpenChange}
      title={t("teamView.move.confirmTitle", {
        agent: agent.name,
        team: team?.name ?? "",
      })}
      description={t("teamView.move.confirmBody", {
        agent: agent.name,
        team: team?.name ?? "",
      })}
      confirmLabel={t("teamView.move.confirm")}
      cancelLabel={t("teamView.move.cancel")}
      variant="default"
      onConfirm={onConfirm}
    />
  );
}
