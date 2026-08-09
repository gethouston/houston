import type { OrgInfo, OrgRole } from "@houston-ai/engine-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { canSeeBillingTab } from "../../lib/billing-gates";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { BackBarScreen } from "../shell/back-bar-screen";
import { AdminIndex } from "./admin-index";
import { AdminSectionDetail } from "./admin-section-detail";
import { useOrgNav } from "./org-nav-store";
import { type OrgTabId, orgTabIds } from "./org-view-model";

/**
 * The shared context every Organization section receives. `org` is the loaded
 * `GET /org` payload (roster + invites for owner/admin); `role` is the caller's
 * org role; `isOwner` is the single mutate-everything gate the sections read so
 * they don't each re-derive it. Defined + exported here so the section modules
 * can type their prop against one contract while the shell owns loading +
 * gating.
 */
export interface OrgViewContext {
  org: OrgInfo;
  role: OrgRole;
  isOwner: boolean;
}

/** Props for every Organization section: the shared context, nothing else. */
export interface OrgTabProps {
  ctx: OrgViewContext;
}

/**
 * The Admin (Organization) dashboard: People, Billing, Analytics, Company
 * context. A shell only: it loads the org, builds the shared `OrgViewContext`,
 * and switches between two screens in the settings-page grammar —
 *
 * - INDEX (`active === null`): a landing of self-describing rows
 *   ({@link AdminIndex}) — People (membership), Billing when in scope, then
 *   Analytics (activity / usage / time worked) and Company context.
 * - DETAIL (`active` set): a back bar + section heading + the section body. That
 *   bar is now the ONLY one on the page: as a TOP-LEVEL view in the rail's
 *   "Workspace" band, Admin owns the whole window and has no level above it.
 *
 * Permission surfaces (who can use which agent, per-agent ceilings) are NOT
 * here: per-agent policy is discovered through each team's Manage agents page,
 * in the team view's settings section. Mounted ONLY when `canSeeOrganization`
 * (multiplayer owner/admin, and on a Spaces host a TEAM active space — never the
 * personal one): the rail hides the row, the kept-alive screen is not even
 * mounted, and `blockedTopLevelView` sends a stale `viewMode` home the moment
 * the gates resolve against it.
 *
 * Kept alive like every top-level screen, so it comes back on the section it was
 * left on — and so the Billing deep link below has to land while the view is
 * ALREADY open, not on a mount that never happens again.
 */
export function OrganizationView() {
  const { t } = useTranslation("teams");
  const { data: org, isLoading } = useOrg(true);
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);

  // Billing shows only for owner/admin on a team space (C8). Compute the visible
  // set so a deep link never opens a dead detail screen.
  const showBilling = canSeeBillingTab(
    capabilities,
    current ? isTeamWorkspace(current.id) : false,
  );
  const visibleIds = orgTabIds({ billing: showBilling });

  // `null` = the index; a section id = its detail screen. Sections start on the
  // index so the admin lands on the scannable overview, not a section body.
  const [active, setActive] = useState<OrgTabId | null>(null);

  // One event per section DETAIL opened (index → detail), keyed like the global
  // view switches so a single tab_name breakdown covers everything. Landing on
  // the view at all is the shell's `tab_opened` / `organization`, so this fires
  // strictly below it and the two never double-count.
  useEffect(() => {
    if (active !== null)
      analytics.track("tab_opened", { tab_name: `org:${active}` });
  }, [active]);

  // Honor a deep link straight into a section's detail — the C8 team-status
  // banner is the one caller, and it asks for Billing — then clear it so a later
  // plain nav to the dashboard opens the index again. (The create-team toast
  // pins nothing: it wants the index, whose lead card is People.) This is an
  // effect on the STORE field, not mount-time state, precisely because the
  // screen is kept alive: it fires on the first mount AND while already open,
  // the same way `team-settings.tsx` consumes its own one-shot pin.
  useEffect(() => {
    if (requestedTab === null) return;
    if (visibleIds.includes(requestedTab)) setActive(requestedTab);
    clearRequestedTab();
  }, [requestedTab, visibleIds, clearRequestedTab]);

  // If the visible set drops the active section (e.g. switching out of a team
  // space hides Billing), fall back to the index rather than a blank body.
  useEffect(() => {
    if (active !== null && !visibleIds.includes(active)) setActive(null);
  }, [visibleIds, active]);

  const ctx: OrgViewContext | null = org
    ? { org, role: org.role, isOwner: org.role === "owner" }
    : null;

  if (active === null) {
    return (
      <div className="flex-1 overflow-y-auto pt-10 [scrollbar-gutter:stable]">
        <AdminIndex
          visibleIds={visibleIds}
          memberCount={org?.members?.length}
          onSelect={setActive}
        />
      </div>
    );
  }

  return (
    <BackBarScreen backLabel={t("org.title")} onBack={() => setActive(null)}>
      <AdminSectionDetail active={active} ctx={ctx} isLoading={isLoading} />
    </BackBarScreen>
  );
}
