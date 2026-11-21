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
        const outcome = await addMember.mutateAsync({
          email: invite.email,
          role: "user",
          options: { silence: isExpectedShareError },
        });
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
