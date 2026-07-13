import { cn } from "@houston-ai/core";
import type { OrgInfo, OrgRole } from "@houston-ai/engine-client";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canSeeBillingTab } from "../../lib/org-roles";
import { isTeamWorkspace } from "../../lib/space-id";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer, PageHeader } from "../shell/page-shell";
import ActivityTab from "./activity-tab";
import AgentsTab from "./agents-tab";
import AllowedIntegrationsTab from "./allowed-integrations-tab";
import AllowedModelsTab from "./allowed-models-tab";
import BillingTab from "./billing-tab";
import MembersTab from "./members-tab";
import { useOrgNav } from "./org-nav-store";
import { type OrgTabId, orgTabIds } from "./org-view-model";
import UsageTab from "./usage-tab";

/**
 * The shared context every Organization tab receives. `org` is the loaded
 * `GET /org` payload (roster + invites for owner/admin); `role` is the caller's
 * org role; `isOwner` is the single mutate-everything gate the tabs read so they
 * don't each re-derive it. Defined + exported here so the four tab modules can
 * type their prop against one contract while the shell owns loading + gating.
 */
export interface OrgViewContext {
  org: OrgInfo;
  role: OrgRole;
  isOwner: boolean;
}

/** Props for every Organization tab: the shared context, nothing else. */
export interface OrgTabProps {
  ctx: OrgViewContext;
}

const TAB_COMPONENTS: Record<OrgTabId, (props: OrgTabProps) => ReactNode> = {
  people: MembersTab,
  agents: AgentsTab,
  activity: ActivityTab,
  usage: UsageTab,
  allowedIntegrations: AllowedIntegrationsTab,
  allowedModels: AllowedModelsTab,
  billing: BillingTab,
};

/**
 * The top-level Organization dashboard (Teams v2): People, Agents, Activity,
 * Usage, Allowed integrations, Allowed AI models. A shell only — it loads the
 * org, builds the shared `OrgViewContext`, and renders the active tab; each tab
 * module owns its own data + UI so the parallel UI wave fills them without
 * touching this file.
 *
 * Rendered ONLY when `canSeeOrganization` (multiplayer owner/admin) — the
 * sidebar hides the nav entry and `workspace-shell` guards the render for
 * everyone else, so this never mounts in single-player or for a plain member.
 */
export function OrganizationView() {
  const { t } = useTranslation("teams");
  const { data: org, isLoading } = useOrg(true);
  const { capabilities } = useCapabilities();
  const current = useWorkspaceStore((s) => s.current);
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);

  // The policy tabs exist only on a Teams host (no `/org/settings` route on a
  // host that predates Teams); the Billing tab only for owner/admin on a team
  // space (C8). Compute the visible tab set so neither ever shows a dead pane.
  const showPolicy = capabilities?.teams === true;
  const showBilling = canSeeBillingTab(
    capabilities,
    current ? isTeamWorkspace(current.id) : false,
  );
  const tabIds = orgTabIds({ policy: showPolicy, billing: showBilling });

  const [tab, setTab] = useState<OrgTabId>("people");

  // Honor a deep link into a tab (the C8 team-status banner/pill routes here),
  // then clear it so a later plain nav to the dashboard opens the default tab.
  useEffect(() => {
    if (requestedTab === null) return;
    if (tabIds.includes(requestedTab)) setTab(requestedTab);
    clearRequestedTab();
  }, [requestedTab, tabIds, clearRequestedTab]);

  // If the visible set drops the active tab (e.g. switching out of a team space
  // hides Billing), fall back to the first tab rather than a blank panel.
  useEffect(() => {
    if (!tabIds.includes(tab)) setTab(tabIds[0]);
  }, [tabIds, tab]);

  const ActiveTab = TAB_COMPONENTS[tab];
  const ctx: OrgViewContext | null = org
    ? { org, role: org.role, isOwner: org.role === "owner" }
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0">
        <PageContainer className="flex flex-col gap-4 pt-10 pb-2">
          <PageHeader title={t("org.title")} subtitle={t("org.subtitle")} />
          <div
            role="tablist"
            aria-label={t("org.tablistLabel")}
            className="flex items-center gap-5"
          >
            {tabIds.map((id) => {
              const isActive = tab === id;
              return (
                <button
                  type="button"
                  role="tab"
                  key={id}
                  id={`org-tab-${id}`}
                  aria-selected={isActive}
                  aria-controls="org-tabpanel"
                  onClick={() => setTab(id)}
                  className={cn(
                    "relative rounded-sm pb-2.5 text-sm transition-colors duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    isActive
                      ? "font-medium text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t(`org.tabs.${id}`)}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-action" />
                  )}
                </button>
              );
            })}
          </div>
        </PageContainer>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer
          role="tabpanel"
          id="org-tabpanel"
          aria-labelledby={`org-tab-${tab}`}
          className="pb-10"
        >
          {ctx ? (
            <ActiveTab ctx={ctx} />
          ) : (
            <p className="py-10 text-sm text-ink-muted">
              {isLoading ? t("org.loading") : t("org.unavailable")}
            </p>
          )}
        </PageContainer>
      </div>
    </div>
  );
}
