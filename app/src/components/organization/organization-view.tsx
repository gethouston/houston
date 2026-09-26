import type { OrgInfo, OrgRole } from "@houston/engine-adapter";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useAdminScreenActive } from "../../hooks/use-admin-screen-active";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { analytics } from "../../lib/analytics";
import { canSeeBillingTab } from "../../lib/billing-gates";
import { isPersonalSpace } from "../../lib/org-roles";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { AdminBody } from "./admin-body";
import { adminBodyState } from "./admin-body-state";
import { ADMIN_HEADER_THRESHOLDS, AdminHeader } from "./admin-header";
import { AdminSectionBody } from "./admin-section-body";
import { useOrgNav } from "./org-nav-store";
import {
  canSeeTimeWorked,
  DEFAULT_ORG_TAB,
  type OrgTabId,
  orgTabIds,
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
  isPersonal: boolean;
}

/** Props for every Organization section: the shared context, nothing else. */
export interface OrgTabProps {
  ctx: OrgViewContext;
}

/**
 * The Admin dashboard: Company context, People, Billing, Activity, Usage, and
 * Time worked. A shell only: it loads the org, builds the shared
 * `OrgViewContext`, and swaps sections under the shared header grammar
 * (`AdminHeader` — the same lozenge cluster Integrations and an employee's
 * screen wear), landing on Company context, whose surface the identity lozenge IS.
 *
 * Permission surfaces (who can use which agent, per-agent ceilings) are NOT
 * here: per-agent policy is discovered on each employee's screen, in its
 * Settings section. Drawn only when `canSeeOrganization` admits the caller:
 * multiplayer owner/admin or a Spaces personal space.
 *
 * Admin is kept alive, so this comes back on the section it was left on, and
 * so the Billing deep link below has to land while the view is ALREADY open, not
 * on a mount that never happens again.
 */
export function OrganizationView() {
  const { t } = useTranslation("teams");
  // Admin is kept alive, so this view stays mounted behind whatever the
  // user opens next; the read belongs to the screen, not to the mount.
  const { capabilities } = useCapabilities();
  const { ready: gatesReady, showOrganization } = useSurfaceGates();
  const { data: org, status: orgStatus } = useOrg(
    useAdminScreenActive() && gatesReady && showOrganization,
  );
  const bodyState = adminBodyState({
    gatesReady,
    showOrganization,
    orgStatus,
    hasOrg: org !== undefined,
  });
  const current = useWorkspaceStore((s) => s.current);
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);

  // Billing shows only for owner/admin on a team space (C8). Compute the visible
  // set so a deep link never opens a dead section.
  const showBilling = canSeeBillingTab(
    capabilities,
    current ? isTeamWorkspace(current.id) : false,
  );
  const activeSpaceIsTeam = current ? isTeamWorkspace(current.id) : false;
  const showTimeWorked = canSeeTimeWorked(capabilities);
  const personal = isPersonalSpace(capabilities, activeSpaceIsTeam);
  const visibleIds = useMemo(
    () =>
      orgTabIds({
        billing: showBilling,
        timeWorked: showTimeWorked,
        personal,
      }),
    [showBilling, showTimeWorked, personal],
  );

  const [active, setActive] = useState<OrgTabId>(DEFAULT_ORG_TAB);

  // One event per section OPENED (a lozenge click or a deep link), keyed like
  // the global view switches so a single tab_name breakdown covers everything.
  // Landing on the view at all is the shell's `tab_opened` / `admin`, so
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
  // Billing — then clear it. This is an effect on the STORE field, not
  // mount-time state, precisely because the screen is kept alive: it fires on
  // the first mount AND while already open, the same way agent settings consumes
  // its own one-shot pin.
  useEffect(() => {
    if (requestedTab === null || bodyState === "pending") return;
    if (visibleIds.includes(requestedTab)) openSection(requestedTab);
    clearRequestedTab();
  }, [requestedTab, bodyState, visibleIds, openSection, clearRequestedTab]);

  // If the visible set drops the active section (e.g. switching out of a team
  // space hides Billing), fall back to the landing section rather than a blank
  // body.
  useEffect(() => {
    if (!visibleIds.includes(active)) setActive(DEFAULT_ORG_TAB);
  }, [visibleIds, active]);

  const ctx: OrgViewContext | null = org
    ? {
        org,
        role: org.role,
        isOwner: org.role === "owner",
        isPersonal: isPersonalSpace(capabilities, activeSpaceIsTeam),
      }
    : null;

  return (
    <AdminBody
      state={bodyState}
      loadingLabel={t("org.loading")}
      unavailableLabel={t("org.unavailable")}
    >
      {ctx && (
        <PageHeaderToolsProvider thresholds={ADMIN_HEADER_THRESHOLDS}>
          <div className="flex h-full min-h-0 flex-col">
            <AdminHeader
              active={active}
              visibleIds={visibleIds}
              onSelect={openSection}
            />
            {/* One scroller for every section. Company context sizes itself to
                exactly this height (its card scrolls internally), so the outer
                scroll only engages as a short-window fallback there. */}
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              <AdminSectionBody active={active} ctx={ctx} />
            </div>
          </div>
        </PageHeaderToolsProvider>
      )}
    </AdminBody>
  );
}
