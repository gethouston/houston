import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { type TeamView, teamDisplayName } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { TeamGlyph } from "../shell/team-glyph";
import { moveTargetTeams } from "../team-view/move-agent-model";

export function AgentMovePickerDialog({
  open,
  onOpenChange,
  teams,
  currentTeamId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: readonly TeamView[];
  currentTeamId: string;
  onSelect: (team: TeamView) => void;
}) {
  const { t } = useTranslation("teams");
  const targets = moveTargetTeams(teams, currentTeamId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("agentSettings.manage.chooseTeam")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 pt-2">
          {targets.map((team) => (
            <Button
              key={team.id}
              variant="outline"
              className="justify-start gap-2"
              onClick={() => onSelect(team)}
            >
              <TeamGlyph team={team} className="size-4 shrink-0" />
              <span className="truncate">
                {teamDisplayName(team, t("teamView.defaultName"))}
              </span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
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
        team: team ? teamDisplayName(team, t("teamView.defaultName")) : "",
      })}
      description={t("teamView.move.confirmBody", {
        agent: agent.name,
        team: team ? teamDisplayName(team, t("teamView.defaultName")) : "",
      })}
      confirmLabel={t("teamView.move.confirm")}
      cancelLabel={t("teamView.move.cancel")}
      variant="default"
      onConfirm={onConfirm}
    />
  );
}
