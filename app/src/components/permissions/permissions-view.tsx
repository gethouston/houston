import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { useAgentStore } from "../../stores/agents";
import { AdminDetailScreen } from "../organization/admin-detail-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AgentDetail } from "./agent-detail";
import { AgentsList } from "./agents-list";
import {
  type PermissionsAgentTab,
  usePermissionsNav,
} from "./permissions-nav-store";

/**
 * The top-level Permissions view (owner/admin only): the ONE place that manages
 * who can do what, and it is FULLY AGENT-CENTRIC. It shows the agent list; open
 * an agent to manage, across three tabs, WHO can use it (People), its app ceiling
 * (Integrations), and its model ceiling (AI Models). There is no per-person lens.
 *
 * A shell only: it loads the org once (roster), owns the drill-in state, and
 * consumes a one-shot deep link from {@link usePermissionsNav} (the blocked-app
 * CTA in the agent workspace routes straight into that agent's detail). Rendered
 * ONLY when `canSeeOrganization` (multiplayer owner/admin) — the sidebar hides
 * the entry and `workspace-shell` guards the render for everyone else, so it
 * never mounts in single-player or for a plain member.
 */
export function PermissionsView() {
  const { t } = useTranslation("teams");
  const { data: org } = useOrg(true);
  const agents = useAgentStore((s) => s.agents);

  const requestedAgentId = usePermissionsNav((s) => s.requestedAgentId);
  const requestedAgentTab = usePermissionsNav((s) => s.requestedAgentTab);
  const clearRequested = usePermissionsNav((s) => s.clearRequested);

  // Drill-in held as an id (not a snapshot) so a store reload keeps the detail
  // pointed at the live row; if the id drops out, it falls back to the list. The
  // opening tab is captured alongside so a deep link can land on Integrations.
  const [detail, setDetail] = useState<{
    agentId: string;
    tab: PermissionsAgentTab;
  } | null>(null);

  // One event per agent drill-in, keyed like the global view switches (the
  // opening tab rides along: permissions:people / integrations / models).
  useEffect(() => {
    if (detail !== null)
      analytics.track("tab_opened", {
        tab_name: `permissions:${detail.tab}`,
        agent_id: detail.agentId,
      });
  }, [detail]);

  // Honor a one-shot deep link (the blocked-app "Enable it in Permissions" CTA),
  // then clear it so a later plain nav lands back on the agent list.
  useEffect(() => {
    if (requestedAgentId === null) return;
    setDetail({
      agentId: requestedAgentId,
      tab: requestedAgentTab ?? "people",
    });
    clearRequested();
  }, [requestedAgentId, requestedAgentTab, clearRequested]);

  const members = org?.members ?? [];
  const detailAgent =
    detail != null
      ? (agents.find((a) => a.id === detail.agentId) ?? null)
      : null;

  // Agent drill-in: one agent's People + Integrations + AI Models. Back returns
  // to the agent list.
  if (detail && detailAgent) {
    return (
      <AdminDetailScreen
        backLabel={t("permissions.title")}
        onBack={() => setDetail(null)}
      >
        <AgentDetail
          agent={detailAgent}
          members={members}
          initialTab={detail.tab}
        />
      </AdminDetailScreen>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-10">
        <PageHeader
          title={t("permissions.title")}
          subtitle={t("permissions.subtitle")}
          className="mb-8 px-1"
        />
        <AgentsList
          members={members}
          onOpenAgent={(a) => setDetail({ agentId: a.id, tab: "people" })}
        />
      </PageContainer>
    </div>
  );
}
