import type { OrgInfo, OrgRole } from "@houston-ai/engine-client";
import { useCallback, useEffect, useState } from "react";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { analytics } from "../../lib/analytics";
import { canSeeBillingTab } from "../../lib/billing-gates";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { ADMIN_HEADER_THRESHOLDS, AdminHeader } from "./admin-header";
import { AdminSectionBody } from "./admin-section-body";
import { useOrgNav } from "./org-nav-store";
import {
  type AnalyticsLens,
  analyticsLenses,
  DEFAULT_ANALYTICS_LENS,
  DEFAULT_ORG_TAB,
  type OrgTabId,
  orgTabIds,
  resolveAnalyticsLens,
} from "./org-view-model";

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
 * The Admin (Organization) dashboard: Company context, People, Billing,
 * Analytics. A shell only: it loads the org, builds the shared
 * `OrgViewContext`, and swaps sections under the shared header grammar
 * (`AdminHeader` — the same lozenge cluster Integrations and the team screen
 * wear), landing on Company context, whose surface the identity lozenge IS.
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
  const { data: org, isLoading } = useOrg(true);
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);

  // Billing shows only for owner/admin on a team space (C8). Compute the visible
  // set so a deep link never opens a dead section.
  const showBilling = canSeeBillingTab(
    capabilities,
    current ? isTeamWorkspace(current.id) : false,
  );
  const visibleIds = orgTabIds({ billing: showBilling });

  const [active, setActive] = useState<OrgTabId>(DEFAULT_ORG_TAB);

  // The Analytics lens, owned HERE beside the section it narrows — the drilled
  // header and the section body both draw it, exactly as they draw `active`.
  // Kept-alive screen state, so leaving and returning lands on the lens you
  // left; the rail's home pin resets the SECTION, deliberately not the lens.
  const [lens, setLens] = useState<AnalyticsLens>(DEFAULT_ANALYTICS_LENS);
  const lenses = analyticsLenses(capabilities);
  const activeLens = resolveAnalyticsLens(lens, lenses);

  // One event per section OPENED (a lozenge click or a deep link), keyed like
  // the global view switches so a single tab_name breakdown covers everything.
  // Landing on the view at all is the shell's `tab_opened` / `organization`, so
  // this fires strictly below it — never on the initial section — and the two
  // never double-count.
  const openSection = useCallback(
    (next: OrgTabId) => {
      if (next !== active)
        analytics.track("tab_opened", { tab_name: `org:${next}` });
      setActive(next);
    },
    [active],
  );

  // Honor a pinned section request — the C8 team-status banner deep-links to
  // Billing, and the rail's Admin row pins the landing section on every click
  // — then clear it. This is an effect on the STORE field, not mount-time
  // state, precisely because the screen is kept alive: it fires on the first
  // mount AND while already open, the same way `team-settings.tsx` consumes
  // its own one-shot pin.
  useEffect(() => {
    if (requestedTab === null) return;
    if (visibleIds.includes(requestedTab)) openSection(requestedTab);
    clearRequestedTab();
  }, [requestedTab, visibleIds, openSection, clearRequestedTab]);

  // If the visible set drops the active section (e.g. switching out of a team
  // space hides Billing), fall back to the landing section rather than a blank
  // body.
  useEffect(() => {
    if (!visibleIds.includes(active)) setActive(DEFAULT_ORG_TAB);
  }, [visibleIds, active]);

  const ctx: OrgViewContext | null = org
    ? { org, role: org.role, isOwner: org.role === "owner" }
    : null;

  return (
    <PageHeaderToolsProvider thresholds={ADMIN_HEADER_THRESHOLDS}>
      <div className="flex h-full flex-col">
        <AdminHeader
          active={active}
          visibleIds={visibleIds}
          onSelect={openSection}
          lens={activeLens}
          lenses={lenses}
          onSelectLens={setLens}
        />
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <AdminSectionBody
            active={active}
            ctx={ctx}
            isLoading={isLoading}
            lens={activeLens}
          />
        </div>
      </div>
    </PageHeaderToolsProvider>
  );
}
