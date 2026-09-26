import { useState } from "react";
import type { useAddMember } from "../../hooks/queries";
import {
  addInviteEmails,
  type EmailInvite,
  isExpectedShareError,
  sendableInvites,
  shareErrorCode,
} from "../../lib/share-via-team";

/** The folder move's closing invite step: who to invite and each send. */
export function useTeamMoveInvites(addMember: ReturnType<typeof useAddMember>) {
  const [invites, setInvites] = useState<EmailInvite[]>([]);
  const [sending, setSending] = useState(false);
  const mark = (email: string, next: Partial<EmailInvite>) =>
    setInvites((items) =>
      items.map((item) => (item.email === email ? { ...item, ...next } : item)),
    );

  const send = async () => {
    setSending(true);
    for (const invite of sendableInvites(invites)) {
      try {
        await addMember.mutateAsync({
          email: invite.email,
          role: "user",
          options: { silence: isExpectedShareError },
        });
        mark(invite.email, { status: "sent" });
      } catch (error) {
        mark(invite.email, {
          status: "failed",
          error: shareErrorCode(error) ?? "error",
        });
      }
    }
    setSending(false);
  };

  return {
    invites,
    sending,
    send,
    addEmails: (emails: string[]) =>
      setInvites((items) => addInviteEmails(items, emails)),
  };
}
