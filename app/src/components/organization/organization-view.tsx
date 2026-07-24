import type { OrgInfo, OrgRole } from "@houston-ai/engine-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { canSeeBillingTab } from "../../lib/org-roles";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { AdminDetailScreen } from "./admin-detail-screen";
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
 * The top-level Admin (Organization) dashboard: membership + insights + billing.
 * A shell only: it loads the org, builds the shared `OrgViewContext`, and
 * switches between two screens in the settings-page grammar —
 *
 * - INDEX (`active === null`): a landing of grouped, self-describing rows
 *   ({@link AdminIndex}) — People (membership), Insights (Activity, Usage), and
 *   Billing when in scope.
 * - DETAIL (`active` set): a back bar + section heading + the section body.
 *
 * Permission surfaces (who can use which agent, per-agent + org-wide ceilings)
 * moved OUT to the top-level Permissions view. Rendered ONLY when
 * `canSeeOrganization` (multiplayer owner/admin, and on a Spaces host a TEAM
 * active space — never the personal one) — the sidebar hides the nav entry and
 * `workspace-shell` guards the render for everyone else.
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

  // One event per section detail opened (index → detail), keyed like the
  // global view switches so a single tab_name breakdown covers everything.
  useEffect(() => {
    if (active !== null)
      analytics.track("tab_opened", { tab_name: `org:${active}` });
  }, [active]);

  // Honor a deep link straight into a section's detail (the C8 team-status
  // banner routes to Billing), then clear it so a later plain nav to the
  // dashboard opens the index again.
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
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <AdminIndex
          visibleIds={visibleIds}
          memberCount={org?.members?.length}
          onSelect={setActive}
        />
      </div>
    );
  }

  return (
    <AdminDetailScreen
      backLabel={t("org.title")}
      onBack={() => setActive(null)}
    >
      <AdminSectionDetail active={active} ctx={ctx} isLoading={isLoading} />
    </AdminDetailScreen>
  );
}
