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
import { AdminAgentDetail } from "./admin-agent-detail";
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

// Agents is off this map on purpose: it takes an extra `onOpenAgent` prop (the
// fleet drill-in) that the generic `{ ctx }` contract can't carry, so the shell
// renders it explicitly. Every OTHER section stays on the generic path.
const SECTION_COMPONENTS: Record<
  Exclude<OrgTabId, "agents">,
  (props: OrgTabProps) => ReactNode
> = {
  people: MembersTab,
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
  const agents = useAgentStore((s) => s.agents);
  const agentCount = agents.length;
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

  // The agent drilled into inside the Agents section (fleet drill-in), held as
  // an ID — not the object — so a share mutation that reloads the agent store
  // (useShareAgent patches it) is reflected live; a snapshot would show stale
  // assignments. Resolved against the current store below; if the id drops out
  // of the store the detail falls back to the grid.
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);
  const detailAgent = detailAgentId
    ? (agents.find((a) => a.id === detailAgentId) ?? null)
    : null;

  // Leaving the Agents section closes any open drill-in, so re-entering Agents
  // (or any other section) always lands on the grid, never a stale detail.
  useEffect(() => {
    if (active !== "agents") setDetailAgentId(null);
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
          agentCount={agentCount}
          allowedToolkits={orgSettings.data?.allowedToolkits}
          allowedModels={orgSettings.data?.allowedModels}
          onSelect={setActive}
        />
      </div>
    );
  }

  // Fleet drill-in: an agent's stacked access controls, one level below the
  // Agents grid. Rendered in place of the section body; its own back bar returns
  // to the grid (clears the drill-in) while `active` stays "agents".
  if (active === "agents" && detailAgent) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 px-8 pt-8 pb-2">
          <button
            type="button"
            onClick={() => setDetailAgentId(null)}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ChevronLeft className="size-4" />
            {t("org.tabs.agents")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <AdminAgentDetail agent={detailAgent} />
        </div>
      </div>
    );
  }

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
            active === "agents" ? (
              <AgentsTab
                ctx={ctx}
                onOpenAgent={(agent) => setDetailAgentId(agent.id)}
              />
            ) : (
              renderSection(active, ctx)
            )
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

/** Render a generic (non-agents) section from its shared `{ ctx }` contract. */
function renderSection(id: Exclude<OrgTabId, "agents">, ctx: OrgViewContext) {
  const Section = SECTION_COMPONENTS[id];
  return <Section ctx={ctx} />;
}
