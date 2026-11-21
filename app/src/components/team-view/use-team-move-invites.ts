import { useState } from "react";
import type { useAddMember } from "../../hooks/queries";
import { isExpectedShareError, shareErrorCode } from "../../lib/share-error";
import {
  addInviteEmails,
  type EmailInvite,
  sendableInvites,
} from "../../lib/share-via-team";

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
        const outcome = await addMember.mutateAsync({
          email: invite.email,
          role: "user",
          options: { silence: isExpectedShareError },
        });
        mark(
          invite.email,
          outcome.kind === "added"
            ? { status: "sent" }
            : { status: "failed", error: outcome.kind },
        );
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
