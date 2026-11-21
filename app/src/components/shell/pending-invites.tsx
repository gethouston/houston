import type { OrgInviteSummary } from "@houston/engine-adapter";
import { Mail } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOrgs } from "../../hooks/queries/use-spaces";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  createInviteActionLock,
  type InviteActionLock,
  visibleInvites,
} from "../../lib/invite-model";
import { hasSpaces } from "../../lib/org-roles";
import { InviteCard } from "./invite-card";

export function PendingInviteList({
  invites,
}: {
  invites: OrgInviteSummary[];
}) {
  const { t } = useTranslation("teams");
  const lockRef = useRef<InviteActionLock | null>(null);
  lockRef.current ??= createInviteActionLock();
  const lock = lockRef.current;
  if (invites.length === 0) return null;
  return (
    <section aria-label={t("inviteInbox.title")} className="px-2 pb-1">
      <ul className="max-h-72 space-y-2 overflow-y-auto overscroll-contain">
        {invites.map((invite) => (
          <InviteCard key={invite.id} invite={invite} lock={lock} />
        ))}
      </ul>
    </section>
  );
}

export function SidebarInviteInbox({
  collapsed,
  onExpand,
}: {
  collapsed: boolean;
  onExpand: () => void;
}) {
  const { capabilities } = useCapabilities();
  const spacesEnabled = hasSpaces(capabilities);
  const { data: spaces } = useOrgs(spacesEnabled);
  const invites = visibleInvites(spacesEnabled, spaces?.invites ?? []);
  return collapsed ? (
    <PendingInvitesRailButton count={invites.length} onExpand={onExpand} />
  ) : (
    <PendingInviteList invites={invites} />
  );
}

export function PendingInvitesRailButton({
  count,
  onExpand,
}: {
  count: number;
  onExpand: () => void;
}) {
  const { t } = useTranslation("teams");
  if (count === 0) return null;
  return (
    <div className="flex justify-center px-2 pb-1">
      <button
        type="button"
        onClick={onExpand}
        aria-label={t("inviteInbox.railLabel", { count })}
        className="ht-hairline flex h-9 items-center justify-center gap-1 rounded-lg bg-card px-2 text-ink transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
      >
        <Mail aria-hidden="true" className="size-4" />
        <span className="text-xs font-medium tabular-nums">{count}</span>
      </button>
    </div>
  );
}
