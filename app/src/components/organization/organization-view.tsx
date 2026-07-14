import type { OrgInfo, OrgRole } from "@houston-ai/engine-client";
import { ChevronLeft } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useOrgSettings } from "../../hooks/queries/use-org-settings";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canSeeBillingTab } from "../../lib/org-roles";
import { isTeamWorkspace } from "../../lib/space-id";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer, PageHeader } from "../shell/page-shell";
import ActivityTab from "./activity-tab";
import { AdminIndex } from "./admin-index";
import AgentsTab from "./agents-tab";
import AllowedIntegrationsTab from "./allowed-integrations-tab";
import AllowedModelsTab from "./allowed-models-tab";
import BillingTab from "./billing-tab";
import MembersTab from "./members-tab";
import { useOrgNav } from "./org-nav-store";
import { type OrgTabId, orgTabIds } from "./org-view-model";
import UsageTab from "./usage-tab";

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

const SECTION_COMPONENTS: Record<OrgTabId, (props: OrgTabProps) => ReactNode> =
  {
    people: MembersTab,
    agents: AgentsTab,
    activity: ActivityTab,
    usage: UsageTab,
    allowedIntegrations: AllowedIntegrationsTab,
    allowedModels: AllowedModelsTab,
    billing: BillingTab,
  };

/**
 * The top-level Admin (Organization) dashboard (Teams v2 + C8 billing). A shell
 * only: it loads the org, builds the shared `OrgViewContext`, and switches
 * between two screens in the settings-page grammar —
 *
 * - INDEX (`active === null`): a landing of grouped, self-describing rows
 *   ({@link AdminIndex}), so a non-technical admin scans People/Agents/Access/
 *   Insights/Billing at a glance instead of reading an anonymous tab strip.
 * - DETAIL (`active` set): a back bar + section heading + the section body (the
 *   existing tab component), full width so its tables aren't clamped.
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
  const agentCount = useAgentStore((s) => s.agents).length;
  const requestedTab = useOrgNav((s) => s.requestedTab);
  const clearRequestedTab = useOrgNav((s) => s.clearRequestedTab);

  // The policy sections exist only on a Teams host (no `/org/settings` route on
  // a host that predates Teams); Billing only for owner/admin on a team space
  // (C8). Compute the visible set so neither ever opens a dead detail screen.
  const showPolicy = capabilities?.teams === true;
  const showBilling = canSeeBillingTab(
    capabilities,
    current ? isTeamWorkspace(current.id) : false,
  );
  const visibleIds = orgTabIds({ policy: showPolicy, billing: showBilling });
  const orgSettings = useOrgSettings(showPolicy);

  // `null` = the index; a section id = its detail screen. Sections start on the
  // index so the admin lands on the scannable overview, not a section body.
  const [active, setActive] = useState<OrgTabId | null>(null);

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
          agentCount={agentCount}
          allowedToolkits={orgSettings.data?.allowedToolkits}
          allowedModels={orgSettings.data?.allowedModels}
          onSelect={setActive}
        />
      </div>
    );
  }

  const ActiveSection = SECTION_COMPONENTS[active];
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-8 pt-8 pb-2">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          {t("org.title")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer className="pb-10">
          <PageHeader title={t(`org.tabs.${active}`)} className="mb-6" />
          {ctx ? (
            <ActiveSection ctx={ctx} />
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
