import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  canRetryMove,
  finish,
  initialState,
  isDismissable,
  ownableTeams,
  pickTeam,
  retrySwitch,
  startCreate,
  type TeamRef,
} from "../../lib/share-via-team";
import type { Agent } from "../../lib/types";
import { useSharePickCopy } from "./pick-step-copy";
import {
  MoveFailedStep,
  SwitchFailedStep,
} from "./share-via-team-failed-steps";
import { InviteStep } from "./share-via-team-invite";
import {
  BusyStep,
  ConfirmStep,
  MovedStep,
  PickStep,
} from "./share-via-team-steps";
import { useAgentOrgMove } from "./use-agent-org-move";
import { useShareCreateTeam } from "./use-share-create-team";
import { useShareInvites } from "./use-share-invites";

/**
 * Where a flow can move its AI Employee. `share`: a team the caller runs, or
 * one they create on the spot, then teammates are invited. `move_out`: the
 * destinations the SDK allows out of the active org (`moveOutDestinations`),
 * Personal included, which needs no invite.
 */
export type ShareViaTeamMode =
  | { kind: "share" }
  | { kind: "move_out"; destinations: TeamRef[] };

/**
 * The "move one AI Employee into another org" pipeline (C8
 * §Share-triggers-team). Drives the pure {@link ShareViaTeamState} machine:
 *
 *   pick -> confirm -> move (poll to `done`) -> SWITCH the active space ->
 *   invite teammates (a team) or end (Personal).
 *
 * PIPELINE ORDER IS LAW: `addOrgMember` targets the ACTIVE space, so the
 * switch into the team precedes any invite (`useShareInvites`).
 */
export function ShareViaTeamFlow({
  agent,
  open,
  onOpenChange,
  mode = { kind: "share" },
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: ShareViaTeamMode;
}) {
  const { t } = useTranslation("teams");
  const pickCopy = useSharePickCopy();
  const { state, setState, orgs, moving, move } = useAgentOrgMove(agent, open);
  const invites = useShareInvites(open, state, setState);
  const create = useShareCreateTeam(setState, orgs.refetch);
  const movingOut = mode.kind === "move_out";

  const handleDone = () => {
    setState(finish);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isDismissable(state)) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t(movingOut ? "moveOut.title" : "shareViaTeam.title", {
              name: agent.name,
            })}
          </DialogTitle>
        </DialogHeader>

        {state.step === "pick" &&
          (movingOut ? (
            <PickStep
              copy={{
                ...pickCopy,
                subtitle: t("moveOut.pick.subtitle"),
                empty: t("moveOut.pick.empty"),
              }}
              teams={mode.destinations}
              onPick={(team) => setState(pickTeam(team))}
            />
          ) : (
            <PickStep
              copy={pickCopy}
              teams={ownableTeams(orgs.data?.orgs ?? [])}
              onPick={(team) => setState(pickTeam(team))}
              create={{
                open: state.creating,
                error: state.createError,
                pending: create.pending,
                onStart: () => setState(startCreate),
                onCreate: create.run,
              }}
            />
          ))}
        {state.step === "confirm" && (
          <ConfirmStep
            agentName={agent.name}
            team={state.team}
            moving={moving}
            onCancel={() => setState(initialState())}
            onMove={move}
          />
        )}
        {state.step === "moving" && (
          <BusyStep
            heading={t("shareViaTeam.moving.heading", {
              agent: agent.name,
              team: state.team.name,
            })}
            body={t("shareViaTeam.moving.body")}
          />
        )}
        {state.step === "switching" && (
          <BusyStep
            heading={t("shareViaTeam.switching.heading", {
              team: state.team.name,
            })}
          />
        )}
        {state.step === "moveFailed" && (
          <MoveFailedStep
            error={state.error}
            canRetry={canRetryMove(state)}
            onRetry={move}
            onClose={() => onOpenChange(false)}
          />
        )}
        {state.step === "switchFailed" && (
          <SwitchFailedStep
            team={state.team}
            onRetry={() => setState((s) => retrySwitch(s))}
            onClose={() => onOpenChange(false)}
          />
        )}
        {state.step === "invite" && (
          <InviteStep
            agentName={agent.name}
            team={state.team}
            invites={state.invites}
            sending={invites.sending}
            onAddEmails={invites.addEmails}
            onSend={invites.send}
            onDone={handleDone}
          />
        )}
        {state.step === "done" && (
          <MovedStep
            agentName={agent.name}
            team={state.team}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
