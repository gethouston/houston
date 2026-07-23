import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAddMember,
  useAgentMoveStatus,
  useMoveAgent,
  useOrgs,
} from "../../hooks/queries";
import { useCreateTeam } from "../../hooks/queries/use-orgs";
import {
  claimMove,
  clearPendingMove,
  recordPendingMove,
  releaseMove,
} from "../../lib/pending-move";
import {
  addInviteEmails,
  applyMovePoll,
  assertInviteReady,
  canRetryMove,
  createFailed,
  finish,
  initialState,
  isDismissable,
  isExpectedShareError,
  MOVE_POLL_TIMEOUT_MS,
  markInviteFailed,
  markInviteSending,
  markInviteSent,
  moveRejected,
  moveTimedOut,
  ownableTeams,
  pickTeam,
  reconcileCreatedTeam,
  retrySwitch,
  type ShareViaTeamState,
  sendableInvites,
  shareErrorCode,
  startCreate,
  startMove,
  switchDone,
  switchFailed,
} from "../../lib/share-via-team";
import { orgSlugFromWorkspaceId } from "../../lib/space-id";
import type { Agent } from "../../lib/types";
import { useWorkspaceStore } from "../../stores/workspaces";
import { InviteStep } from "./share-via-team-invite";
import {
  BusyStep,
  ConfirmStep,
  MoveFailedStep,
  PickStep,
  SwitchFailedStep,
} from "./share-via-team-steps";

/**
 * The "share a personal agent by moving it into a team" pipeline (C8
 * §Share-triggers-team). Drives the pure {@link ShareViaTeamState} machine and
 * wires each transition to the gateway:
 *
 *   pick/create team -> confirm -> move (poll to `done`) -> SWITCH the active
 *   space to the team (E3 switch sequence) -> invite teammates -> done.
 *
 * PIPELINE ORDER IS LAW: `addOrgMember` targets the ACTIVE space, so the flow
 * switches into the team after the move completes and BEFORE any invite; the
 * machine's `assertInviteReady` guards it. The move-completion signal is the
 * poll route only, never the event stream.
 */

export function ShareViaTeamFlow({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("teams");
  const [state, setState] = useState<ShareViaTeamState>(initialState);
  const [sending, setSending] = useState(false);
  const orgs = useOrgs(open);
  const createTeam = useCreateTeam();
  const moveAgent = useMoveAgent();
  const addMember = useAddMember();
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);

  const moveId = state.step === "moving" ? state.moveId : null;
  const moveStatus = useAgentMoveStatus(
    agent.id,
    moveId,
    state.step === "moving",
  );
  const polled = moveStatus.data;

  // Reset when the dialog closes so a reopen always starts clean. Also release
  // the pending-move claim: the record itself stays until the move reaches
  // `done`, so an abandoned move is resumed by `useMoveResume` on next boot
  // (HOU-817) instead of leaving the agent locked behind the gateway's
  // "agent is being moved" guard forever.
  useEffect(() => {
    if (!open) {
      setState(initialState());
      setSending(false);
      releaseMove(agent.id);
    }
  }, [open, agent.id]);
  useEffect(() => () => releaseMove(agent.id), [agent.id]);

  // Fold each move-status poll into the machine (moving -> switching | failed).
  // Terminal `done` retires the durable pending-move record — the ONLY event
  // that does; every other exit leaves it for the boot-time resume.
  useEffect(() => {
    if (!polled) return;
    if (polled.status === "done") clearPendingMove(agent.id);
    setState((s) => applyMovePoll(s, polled));
  }, [polled, agent.id]);

  // Wall-clock ceiling on the non-dismissable `moving` step: without it a gateway
  // move that never reaches done/failed strands the user on an un-closable
  // spinner. On timeout, surface a closable, retryable `moveFailed` (the
  // server-side move keeps running and is resumable). Re-arms per moveId.
  useEffect(() => {
    if (moveId === null) return;
    const timer = setTimeout(
      () => setState((s) => moveTimedOut(s)),
      MOVE_POLL_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [moveId]);

  // Once the move completes, switch the ACTIVE space to the team (the workspaces
  // store's setCurrent IS the E3 switch sequence) BEFORE inviting — the C8 rule.
  // If the just-moved team isn't in the reloaded list (or the reload throws), we
  // MUST NOT advance to invite: inviting with the active space still personal
  // would 403 `personal_space` on every add. Surface a closable `switchFailed`.
  useEffect(() => {
    if (state.step !== "switching") return;
    const { team } = state;
    let cancelled = false;
    void (async () => {
      try {
        await loadWorkspaces();
        const ws = useWorkspaceStore
          .getState()
          .workspaces.find((w) => orgSlugFromWorkspaceId(w.id) === team.slug);
        if (cancelled) return;
        if (!ws) {
          setState((s) => switchFailed(s));
          return;
        }
        setCurrentWorkspace(ws);
        setState((s) => switchDone(s));
      } catch {
        if (!cancelled) setState((s) => switchFailed(s));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, loadWorkspaces, setCurrentWorkspace]);

  const handleCreate = async (name: string) => {
    try {
      const created = await createTeam.mutateAsync(name);
      setState(pickTeam({ slug: created.slug, name: created.name }));
    } catch {
      // POST /v1/orgs is NOT idempotent: a lost response may still have created
      // the team. Reconcile via the fresh list before ever retrying blind.
      const res = await orgs.refetch();
      const reconciled = reconcileCreatedTeam(res.data?.orgs ?? [], name);
      if (reconciled) {
        setState(pickTeam(reconciled));
        return;
      }
      setState((s) => createFailed(s, t("shareViaTeam.pick.failed")));
    }
  };

  const handleMove = async () => {
    if (state.step !== "confirm" && state.step !== "moveFailed") return;
    const toSlug = state.team.slug;
    const teamName = state.team.name;
    try {
      const { moveId: id } = await moveAgent.mutateAsync({
        agentSlugOrId: agent.id,
        toSlug,
      });
      // Persist the accepted move BEFORE polling: from here on the gateway
      // holds a durable lock only a completed move releases, so the ticket
      // must survive a closed dialog or app quit for `useMoveResume`.
      recordPendingMove({
        agentId: agent.id,
        agentName: agent.name,
        teamSlug: toSlug,
        teamName,
        moveId: id,
        startedAt: Date.now(),
      });
      claimMove(agent.id);
      setState((s) => startMove(s, id));
    } catch (err) {
      setState((s) => moveRejected(s, shareErrorCode(err)));
    }
  };

  const handleAddEmails = (emails: string[]) => {
    setState((s) =>
      s.step === "invite"
        ? { ...s, invites: addInviteEmails(s.invites, emails) }
        : s,
    );
  };

  const handleSend = async () => {
    if (state.step !== "invite") return;
    // Pipeline-order guard: never invite before the move + switch completed.
    assertInviteReady(state);
    const targets = sendableInvites(state.invites);
    if (targets.length === 0) return;
    setSending(true);
    for (const invite of targets) {
      setState((s) =>
        s.step === "invite"
          ? { ...s, invites: markInviteSending(s.invites, invite.email) }
          : s,
      );
      try {
        // Silence the expected `already_member` state from `call()`'s generic
        // bug toast — the `InviteBadge` renders it inline as the sole surface.
        await addMember.mutateAsync({
          email: invite.email,
          role: "user",
          options: { silence: isExpectedShareError },
        });
        setState((s) =>
          s.step === "invite"
            ? { ...s, invites: markInviteSent(s.invites, invite.email) }
            : s,
        );
      } catch (err) {
        const code = shareErrorCode(err) ?? "error";
        setState((s) =>
          s.step === "invite"
            ? { ...s, invites: markInviteFailed(s.invites, invite.email, code) }
            : s,
        );
      }
    }
    setSending(false);
  };

  const handleDone = () => {
    setState(finish);
    onOpenChange(false);
  };

  const dismissable = isDismissable(state);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissable) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("shareViaTeam.title", { name: agent.name })}
          </DialogTitle>
        </DialogHeader>

        {state.step === "pick" && (
          <PickStep
            teams={ownableTeams(orgs.data?.orgs ?? [])}
            creating={state.creating}
            createError={state.createError}
            isCreating={createTeam.isPending}
            onPick={(team) => setState(pickTeam(team))}
            onStartCreate={() => setState(startCreate)}
            onCreate={handleCreate}
          />
        )}
        {state.step === "confirm" && (
          <ConfirmStep
            agentName={agent.name}
            team={state.team}
            moving={moveAgent.isPending}
            onCancel={() => setState(initialState())}
            onMove={handleMove}
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
            onRetry={handleMove}
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
            sending={sending}
            onAddEmails={handleAddEmails}
            onSend={handleSend}
            onDone={handleDone}
          />
        )}
        {state.step === "done" && (
          <BusyStep
            heading={t("shareViaTeam.done.heading", { team: state.team.name })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
