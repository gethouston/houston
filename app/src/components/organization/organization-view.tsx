import type { OrgInfo, OrgMember, OrgRole } from "@houston-ai/engine-client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useOrgSettings } from "../../hooks/queries/use-org-settings";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canSeeBillingTab } from "../../lib/org-roles";
import { isTeamWorkspace } from "../../lib/space-id";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { PageContainer } from "../shell/page-shell";
import { AdminAgentDetail } from "./admin-agent-detail";
import { AdminDetailScreen } from "./admin-detail-screen";
import { AdminIndex } from "./admin-index";
import { AdminSectionDetail } from "./admin-section-detail";
import { MemberDetail } from "./member-detail";
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
  const requestedAgentId = useOrgNav((s) => s.requestedAgentId);
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

  // The member drilled into inside the People section (per-person access lens),
  // held as an id — not the object — so the roster reloading (a role change)
  // keeps the detail pointed at the live member; if the id drops out of the
  // roster the detail falls back to the list.
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null);

  // Leaving the Agents section closes any open drill-in, so re-entering Agents
  // (or any other section) always lands on the grid, never a stale detail.
  useEffect(() => {
    if (active !== "agents") setDetailAgentId(null);
  }, [active]);

  // Same for the People section: leaving it closes the member lens.
  useEffect(() => {
    if (active !== "people") setDetailMemberId(null);
  }, [active]);

  // Honor a deep link straight into a section's detail (the C8 team-status
  // banner routes to Billing; the blocked-app "Enable it in Permissions" CTA
  // routes to a specific agent's drill-in), then clear it so a later plain nav
  // to the dashboard opens the index again.
  useEffect(() => {
    if (requestedTab === null) return;
    if (visibleIds.includes(requestedTab)) {
      setActive(requestedTab);
      if (requestedAgentId) setDetailAgentId(requestedAgentId);
    }
    clearRequestedTab();
  }, [requestedTab, requestedAgentId, visibleIds, clearRequestedTab]);

  // If the visible set drops the active section (e.g. switching out of a team
  // space hides Billing), fall back to the index rather than a blank body.
  useEffect(() => {
    if (active !== null && !visibleIds.includes(active)) setActive(null);
  }, [visibleIds, active]);

  const ctx: OrgViewContext | null = org
    ? { org, role: org.role, isOwner: org.role === "owner" }
    : null;

  const detailMember: OrgMember | null = detailMemberId
    ? (org?.members?.find((m) => m.userId === detailMemberId) ?? null)
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
      <AdminDetailScreen
        backLabel={t("org.tabs.agents")}
        onBack={() => setDetailAgentId(null)}
      >
        <AdminAgentDetail agent={detailAgent} />
      </AdminDetailScreen>
    );
  }

  // Per-person access lens: one member's agents, one level below the People
  // roster. Its own back bar returns to the roster (clears the drill-in) while
  // `active` stays "people".
  if (active === "people" && detailMember) {
    return (
      <AdminDetailScreen
        backLabel={t("org.tabs.people")}
        onBack={() => setDetailMemberId(null)}
      >
        <PageContainer className="pb-10">
          <MemberDetail member={detailMember} />
        </PageContainer>
      </AdminDetailScreen>
    );
  }

  return (
    <AdminDetailScreen
      backLabel={t("org.title")}
      onBack={() => setActive(null)}
    >
      <AdminSectionDetail
        active={active}
        ctx={ctx}
        isLoading={isLoading}
        onOpenAgent={(agent) => setDetailAgentId(agent.id)}
        onOpenMember={(member) => setDetailMemberId(member.userId)}
      />
    </AdminDetailScreen>
  );
}
