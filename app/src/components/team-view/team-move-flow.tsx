import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTeamMoveFlow } from "../../hooks/use-team-move-flow";
import {
  finishTeamMove,
  isTeamMoveDismissable,
  type TeamMoveSource,
} from "../../lib/move-team";
import {
  addInviteEmails,
  isExpectedShareError,
  ownableTeams,
  reconcileCreatedTeam,
  sendableInvites,
  shareErrorCode,
} from "../../lib/share-via-team";
import { InviteStep } from "../agent/share-via-team-invite";
import { BusyStep, PickStep } from "../agent/share-via-team-steps";
import { TeamMoveConfirm } from "./team-move-confirm";
import { TeamMoveFailure } from "./team-move-failure";
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
  const flow = useTeamMoveFlow(source, open);
  const { state, setState } = flow;
  const [invites, setInvites] = useState<ReturnType<typeof addInviteEmails>>(
    [],
  );
  const [sending, setSending] = useState(false);
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
              createError: t("shareViaTeam.pick.failed"),
            },
      );
    }
  };

  const send = async () => {
    setSending(true);
    for (const invite of sendableInvites(invites)) {
      try {
        await flow.addMember.mutateAsync({
          email: invite.email,
          role: "user",
          options: { silence: isExpectedShareError },
        });
        setInvites((items) =>
          items.map((item) =>
            item.email === invite.email ? { ...item, status: "sent" } : item,
          ),
        );
      } catch (error) {
        setInvites((items) =>
          items.map((item) =>
            item.email === invite.email
              ? {
                  ...item,
                  status: "failed",
                  error: shareErrorCode(error) ?? "error",
                }
              : item,
          ),
        );
      }
    }
    setSending(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || isTeamMoveDismissable(state)) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("moveTeam.title", { team: source.name })}
          </DialogTitle>
        </DialogHeader>
        {state.step === "pick" && (
          <PickStep
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
              name: source.agents[state.index]?.name ?? source.name,
              index: state.index + 1,
              total: source.agents.length,
            })}
            body={t("moveTeam.movingBody")}
          />
        )}
        {["cleanupSource", "switching", "recreate", "placing"].includes(
          state.step,
        ) && <BusyStep heading={t(`moveTeam.${state.step}`)} />}
        {state.step === "moveFailed" && (
          <TeamMoveFailure
            body={t("moveTeam.moveFailed", {
              count: source.agents.length,
            })}
            onRetry={flow.moveAgents}
            onClose={() => onOpenChange(false)}
          />
        )}
        {state.step === "postscriptFailed" && (
          <TeamMoveFailure
            body={t("moveTeam.postscriptFailed", {
              count: source.agents.length,
            })}
            onRetry={() => setState(flow.retryTeamMove(state))}
            onClose={() => onOpenChange(false)}
          />
        )}
        {state.step === "invite" && (
          <InviteStep
            agentName={source.name}
            team={state.target}
            invites={invites}
            sending={sending}
            onAddEmails={(emails) =>
              setInvites((items) => addInviteEmails(items, emails))
            }
            onSend={send}
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
