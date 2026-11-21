import type { OrgInfo, OrgRole } from "@houston/engine-adapter";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { useAdminScreenActive } from "../../hooks/use-admin-screen-active";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { analytics } from "../../lib/analytics";
import { isPersonalSpace } from "../../lib/org-roles";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { AdminBody } from "./admin-body";
import { adminBodyState } from "./admin-body-state";
import { ADMIN_HEADER_THRESHOLDS, AdminHeader } from "./admin-header";
import { AdminSectionBody } from "./admin-section-body";
import { CompanyContextEditor } from "./company-context-editor";
import { CompanyContextTool } from "./company-context-tool";
import { useOrgNav } from "./org-nav-store";
import { DEFAULT_ORG_TAB, type OrgTabId, orgTabIds } from "./org-view-model";

export interface OrgViewContext {
  org: OrgInfo;
  role: OrgRole;
  isOwner: boolean;
  isPersonal: boolean;
}

export interface OrgTabProps {
  ctx: OrgViewContext;
}

export function OrganizationView() {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const {
    ready: gatesReady,
    showOrganization,
    showBilling,
  } = useSurfaceGates();
  const { isLoading: billingLoading } = useActiveOrgBilling();
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

  const activeSpaceIsTeam = current ? isTeamWorkspace(current.id) : false;
  const personal = isPersonalSpace(capabilities, activeSpaceIsTeam);
  const visibleIds = useMemo(
    () => orgTabIds({ billing: showBilling, personal }),
    [showBilling, personal],
  );

  const [active, setActive] = useState<OrgTabId>(DEFAULT_ORG_TAB);

  const openSection = useCallback(
    (next: OrgTabId) => {
      if (next !== active)
        analytics.track("tab_opened", { tab_name: `org:${next}` });
      setActive(next);
    },
    [active],
  );

  const openCompanyContext = useCallback(
    () => analytics.track("tab_opened", { tab_name: "org:companyContext" }),
    [],
  );

  useEffect(() => {
    if (requestedTab === null || bodyState === "pending") return;
    if (requestedTab === "billing" && billingLoading) return;
    if (visibleIds.includes(requestedTab)) openSection(requestedTab);
    clearRequestedTab();
  }, [
    requestedTab,
    bodyState,
    billingLoading,
    visibleIds,
    openSection,
    clearRequestedTab,
  ]);

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
            <CompanyContextTool onOpened={openCompanyContext}>
              <CompanyContextEditor />
            </CompanyContextTool>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
              <AdminSectionBody active={active} ctx={ctx} />
            </div>
          </div>
        </PageHeaderToolsProvider>
      )}
    </AdminBody>
  );
}
