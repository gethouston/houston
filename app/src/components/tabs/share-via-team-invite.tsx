import { Button, Input } from "@houston-ai/core";
import { Check, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EmailInvite, TeamRef } from "../../lib/share-via-team";

/**
 * The invite step of {@link ShareViaTeamFlow}: an email roster targeting the
 * now-active team space (the flow switched into it after the move completed).
 * Presentational only — the container owns the `addOrgMember` calls and the
 * per-email status transitions; this just reads the roster and reports back
 * emails to add / a send request / a done request.
 */
export function InviteStep({
  agentName,
  team,
  invites,
  sending,
  onAddEmails,
  onSend,
  onDone,
}: {
  agentName: string;
  team: TeamRef;
  invites: EmailInvite[];
  sending: boolean;
  onAddEmails: (emails: string[]) => void;
  onSend: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("teams");
  const [value, setValue] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    const emails = value.split(/[\s,]+/).filter(Boolean);
    if (emails.length === 0) return;
    onAddEmails(emails);
    setValue("");
  };

  const hasSendable = invites.some(
    (i) => i.status === "pending" || i.status === "failed",
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t("shareViaTeam.invite.subtitle", {
          agent: agentName,
          team: team.name,
        })}
      </p>

      <form onSubmit={add} className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("shareViaTeam.invite.emailPlaceholder")}
            aria-label={t("shareViaTeam.invite.emailPlaceholder")}
            className="rounded-xl"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={!value.trim()}>
          {t("shareViaTeam.invite.add")}
        </Button>
      </form>

      {invites.length > 0 ? (
        <ul className="space-y-1">
          {invites.map((invite) => (
            <li
              key={invite.email}
              className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm"
            >
              <span className="truncate">{invite.email}</span>
              <InviteBadge invite={invite} />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onDone} disabled={sending}>
          {t("shareViaTeam.invite.done")}
        </Button>
        <Button onClick={onSend} disabled={!hasSendable || sending}>
          {sending
            ? t("shareViaTeam.invite.sending")
            : t("shareViaTeam.invite.send")}
        </Button>
      </div>
    </div>
  );
}

function InviteBadge({ invite }: { invite: EmailInvite }) {
  const { t } = useTranslation("teams");
  if (invite.status === "sent") {
    return (
      <span className="flex items-center gap-1 text-xs text-success">
        <Check className="size-3.5" />
        {t("shareViaTeam.invite.status.sent")}
      </span>
    );
  }
  if (invite.status === "failed") {
    const key =
      invite.error === "already_member"
        ? "shareViaTeam.invite.error.already_member"
        : "shareViaTeam.invite.error.generic";
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <X className="size-3.5" />
        {t(key)}
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      {t(`shareViaTeam.invite.status.${invite.status}`)}
    </span>
  );
}
