import type { OrgInviteSummary } from "@houston-ai/engine-client";
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

/**
 * The invite inbox on the expanded sidebar rail: every pending invitation
 * addressed to the caller, each with Accept / Decline. Renders nothing when
 * there is none, so a solo user never sees the chrome.
 *
 * The list is BOUNDED (`max-h-72`) and scrolls inside itself. The sidebar
 * header is a fixed, non-scrolling region above the nav, so an unbounded list
 * would push the navigation down and get clipped by the rail's
 * `overflow-hidden` — invitations you cannot reach. The bound is sized to TWO
 * WHOLE cards plus the top edge of a third: at the previous `max-h-52` the
 * second card was sliced through its own Accept / Decline row, which reads as a
 * rendering fault rather than "scroll for more" (macOS overlay scrollbars show
 * nothing until you scroll). A clipped card TOP is the affordance; nothing here
 * is hover-gated, and no invite is ever hidden behind a "show more" the user
 * has to discover.
 */
export function PendingInviteList({
  invites,
}: {
  invites: OrgInviteSummary[];
}) {
  const { t } = useTranslation("teams");
  // One lock for the whole list (it is keyed by invite id), held across
  // re-renders so a re-paint mid-flight can't reopen a second call.
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

/**
 * The invite inbox as the sidebar mounts it: the `headerBelow` band, a
 * full-width row directly under the workspace switcher. It owns its own data
 * gate so the switcher header stays about switching spaces.
 *
 * Spaces-gated on BOTH sides. The FETCH is gated because off a Spaces host
 * `listOrgs` has nothing to answer; the RENDER is gated because disabling a
 * React Query does not clear its cache, so a session that loses the capability
 * would keep painting the last fetch's invites over a deployment whose mutators
 * throw. `hasSpaces(null)` is false while capabilities load, so the same gate is
 * the no-flash-on-boot rule.
 */
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

/**
 * The collapsed rail's stand-in for the list: the cards need width the icon
 * rail doesn't have, so the count becomes a labelled button that expands the
 * sidebar onto the real thing. Still no hover gating, and still impossible to
 * miss: a user who collapsed the rail must not lose the invitation.
 */
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
