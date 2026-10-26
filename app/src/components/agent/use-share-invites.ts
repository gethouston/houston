import { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { useAddMember } from "../../hooks/queries";
import { isExpectedShareError, shareErrorCode } from "../../lib/share-error";
import {
  addInviteEmails,
  assertInviteReady,
  markInviteFailed,
  markInviteSending,
  markInviteSent,
  type ShareViaTeamState,
  sendableInvites,
} from "../../lib/share-via-team";

/**
 * The invite step of the share pipeline: add emails to the roster and send
 * each one, so a partial failure retries only its own rows. `addOrgMember`
 * targets the ACTIVE space, so nothing is sent before the move and the switch
 * completed (`assertInviteReady`).
 */
export function useShareInvites(
  open: boolean,
  state: ShareViaTeamState,
  setState: Dispatch<SetStateAction<ShareViaTeamState>>,
) {
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!open) setSending(false);
  }, [open]);
  const addMember = useAddMember();
  const patch = (
    update: (s: ShareViaTeamState & { step: "invite" }) => ShareViaTeamState,
  ) => setState((s) => (s.step === "invite" ? update(s) : s));

  const addEmails = (emails: string[]) =>
    patch((s) => ({ ...s, invites: addInviteEmails(s.invites, emails) }));

  const send = async () => {
    if (state.step !== "invite") return;
    assertInviteReady(state);
    const targets = sendableInvites(state.invites);
    if (targets.length === 0) return;
    setSending(true);
    for (const invite of targets) {
      patch((s) => ({
        ...s,
        invites: markInviteSending(s.invites, invite.email),
      }));
      try {
        // `already_member` is expected: the badge renders it inline as the
        // sole surface, so `call()` must not also show its bug toast.
        const outcome = await addMember.mutateAsync({
          email: invite.email,
          role: "user",
          options: { silence: isExpectedShareError },
        });
        // A seat this flow cannot pay for (it shows no price) fails the row;
        // the People tab is where a seat is bought.
        patch((s) => ({
          ...s,
          invites:
            outcome.kind === "added"
              ? markInviteSent(s.invites, invite.email)
              : markInviteFailed(s.invites, invite.email, outcome.kind),
        }));
      } catch (err) {
        const code = shareErrorCode(err) ?? "error";
        patch((s) => ({
          ...s,
          invites: markInviteFailed(s.invites, invite.email, code),
        }));
      }
    }
    setSending(false);
  };

  return { sending, addEmails, send };
}
