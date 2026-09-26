import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useTeamMoveFlow } from "../../hooks/use-team-move-flow";
import {
  finishTeamMove,
  isTeamMoveDismissable,
  type TeamMoveSource,
  teamMoveFailureCopy,
} from "../../lib/move-team";
import { ownableTeams, reconcileCreatedTeam } from "../../lib/share-via-team";
import { closedPostscriptFailureToast } from "../../lib/team-move-retry";
import { useUIStore } from "../../stores/ui";
import { useMovePickCopy } from "../agent/pick-step-copy";
import { InviteStep } from "../agent/share-via-team-invite";
import { BusyStep, PickStep } from "../agent/share-via-team-steps";
import { TeamMoveConfirm } from "./team-move-confirm";
import { TeamMoveFailure } from "./team-move-failure";
import { useTeamMoveInvites } from "./use-team-move-invites";
export function TeamMoveFlow({
  source,
  open,
  onOpenChange,
}: {
  source: TeamMoveSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("teams");
  const pickCopy = useMovePickCopy();
  const flow = useTeamMoveFlow(source, open);
  const { state, setState } = flow;
  const movingSource = flow.movingSource;
  const invites = useTeamMoveInvites(flow.addMember);
  const openTeamMove = useUIStore((store) => store.openTeamMove);
  const addToast = useUIStore((store) => store.addToast);
  // The failing agent's index is how many actually made it: the run stops
  // there, so the copy must not imply the rest are already in the new team.
  const moveFailure =
    state.step === "moveFailed"
      ? teamMoveFailureCopy(state.index, movingSource.agents.length)
      : null;
  const create = async (name: string) => {
    try {
      const team = await flow.createOrg.mutateAsync(name);
      setState(flow.confirmTeamMove({ slug: team.slug, name: team.name }));
    } catch {
      const refreshed = await flow.orgs.refetch();
      const team = reconcileCreatedTeam(refreshed.data?.orgs ?? [], name);
      setState(
        team
          ? flow.confirmTeamMove(team)
          : {
              step: "pick",
              creating: false,
              createError: t("moveTeam.pick.failed"),
            },
      );
    }
  };

  const closeUnfinished = () => {
    const toast = closedPostscriptFailureToast(
      state,
      source,
      {
        title: t("moveTeamResume.failed", { team: source.name }),
        retry: t("moveTeam.retry"),
      },
      openTeamMove,
    );
    onOpenChange(false);
    if (toast) addToast(toast);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || isTeamMoveDismissable(state)) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("moveTeam.title", { team: source.name })}
          </DialogTitle>
        </DialogHeader>
        {state.step === "pick" && (
          <PickStep
            copy={pickCopy}
            teams={ownableTeams(flow.orgs.data?.orgs ?? [])}
            creating={state.creating}
            createError={state.createError}
            isCreating={flow.createOrg.isPending}
            onPick={(team) => setState(flow.confirmTeamMove(team))}
            onStartCreate={() =>
              setState({ step: "pick", creating: true, createError: null })
            }
            onCreate={create}
          />
        )}
        {state.step === "confirm" && (
          <TeamMoveConfirm
            source={source}
            target={state.target}
            onBack={() =>
              setState({ step: "pick", creating: false, createError: null })
            }
            onMove={flow.moveAgents}
          />
        )}
        {state.step === "movingAgents" && (
          <BusyStep
            heading={t("moveTeam.moving", {
              name: movingSource.agents[state.index]?.name ?? source.name,
              index: state.index + 1,
              total: movingSource.agents.length,
            })}
            body={t("moveTeam.movingBody")}
          />
        )}
        {["createTarget", "cleanupSource", "switching"].includes(
          state.step,
        ) && <BusyStep heading={t(`moveTeam.${state.step}`)} />}
        {state.step === "moveFailed" && moveFailure && (
          <TeamMoveFailure
            body={
              moveFailure.key === "moveFailedFirst"
                ? t("moveTeam.moveFailedFirst", { count: moveFailure.count })
                : t("moveTeam.moveFailedNext", {
                    moved: moveFailure.moved,
                    total: moveFailure.total,
                  })
            }
            onRetry={flow.moveAgents}
            onClose={() => onOpenChange(false)}
          />
        )}
        {state.step === "postscriptFailed" && (
          <TeamMoveFailure
            body={
              // A team with no agents skips straight to the postscript, so
              // there is no count to report: the whole move is the subject.
              movingSource.agents.length === 0
                ? t("moveTeam.postscriptFailedEmpty")
                : t("moveTeam.postscriptFailed", {
                    count: movingSource.agents.length,
                  })
            }
            onRetry={flow.retryPostscript}
            onClose={closeUnfinished}
          />
        )}
        {state.step === "invite" && (
          <InviteStep
            agentName={source.name}
            team={state.target}
            invites={invites.invites}
            sending={invites.sending}
            onAddEmails={invites.addEmails}
            onSend={invites.send}
            onDone={() => {
              setState(finishTeamMove);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
