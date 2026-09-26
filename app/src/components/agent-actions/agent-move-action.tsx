import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { TeamGlyph } from "../shell/team-glyph";
import { moveTargetTeams } from "../team-view/move-agent-model";

export type MoveTarget =
  | { kind: "team"; team: TeamView }
  | { kind: "ungrouped" };

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
  currentTeamId: string | null;
  onSelect: (target: MoveTarget) => void;
}) {
  const { t } = useTranslation("teams");
  const targets = moveTargetTeams(teams);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("agentSettings.manage.chooseTeam")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 pt-2">
          {targets.map((team) => (
            <Button
              key={team?.id ?? "ungrouped"}
              variant="outline"
              className="justify-start gap-2"
              disabled={(team?.id ?? null) === currentTeamId}
              onClick={() =>
                onSelect(team ? { kind: "team", team } : { kind: "ungrouped" })
              }
            >
              {team && <TeamGlyph team={team} className="size-4 shrink-0" />}
              <span className="truncate">
                {team?.name ?? t("agentSettings.manage.noTeam")}
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
  target,
  onOpenChange,
  onConfirm,
}: {
  agent: Agent;
  target: MoveTarget | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("teams");
  const name =
    target?.kind === "team"
      ? target.team.name
      : t("agentSettings.manage.noTeam");
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      title={t("teamView.move.confirmTitle", { agent: agent.name, team: name })}
      description={t("teamView.move.confirmBody", {
        agent: agent.name,
        team: name,
      })}
      confirmLabel={t("teamView.move.confirm")}
      cancelLabel={t("teamView.move.cancel")}
      variant="default"
      onConfirm={onConfirm}
    />
  );
}
