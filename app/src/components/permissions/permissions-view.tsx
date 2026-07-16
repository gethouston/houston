import { Tabs, TabsContent, TabsList, TabsTrigger } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useSession } from "../../hooks/use-session";
import { useAgentStore } from "../../stores/agents";
import { AdminDetailScreen } from "../organization/admin-detail-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AgentDetail } from "./agent-detail";
import { MemberDetail } from "./member-detail";
import { PermissionsAgentsTab } from "./permissions-agents-tab";
import {
  type PermissionsTab,
  usePermissionsNav,
} from "./permissions-nav-store";
import { PermissionsPeopleTab } from "./permissions-people-tab";

/**
 * The top-level Permissions view (Teams v2): the ONE place that manages who can
 * do what. Two tabs —
 *
 * - **People**: the roster as a read-only list; each person drills into their
 *   per-agent access lens (which agents they can use, at what level).
 * - **Agents**: the workspace-wide "Defaults for every agent" ceilings, then the
 *   agent list; each agent drills into its per-agent integration + model
 *   ceilings.
 *
 * A shell only: it loads the org once (roster + role), owns the tab + drill-in
 * state, and consumes a one-shot deep link from {@link usePermissionsNav} (the
 * blocked-app CTA in the agent workspace routes here). Rendered ONLY when
 * `canSeeOrganization` (multiplayer owner/admin) — the sidebar hides the entry
 * and `workspace-shell` guards the render for everyone else, so it never mounts
 * in single-player or for a plain member.
 */
export function PermissionsView() {
  const { t } = useTranslation("teams");
  const { data: org } = useOrg(true);
  const { data: session } = useSession();
  const selfId = session?.uid ?? null;
  const agents = useAgentStore((s) => s.agents);

  const requestedTab = usePermissionsNav((s) => s.requestedTab);
  const requestedAgentId = usePermissionsNav((s) => s.requestedAgentId);
  const clearRequested = usePermissionsNav((s) => s.clearRequested);

  const [tab, setTab] = useState<PermissionsTab>("people");

  // Drill-ins held as ids (not snapshots) so a roster/store reload keeps the
  // detail pointed at the live row; if the id drops out, the detail falls back
  // to the list.
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null);
  const [detailAgentId, setDetailAgentId] = useState<string | null>(null);

  // Switching tabs closes any open drill-in so re-entering a tab lands on its
  // list, never a stale detail from the other tab.
  useEffect(() => {
    if (tab !== "people") setDetailMemberId(null);
    if (tab !== "agents") setDetailAgentId(null);
  }, [tab]);

  // Honor a one-shot deep link (the blocked-app "Enable it in Permissions" CTA),
  // then clear it so a later plain nav lands on the default tab.
  useEffect(() => {
    if (requestedTab === null) return;
    setTab(requestedTab);
    if (requestedAgentId) setDetailAgentId(requestedAgentId);
    clearRequested();
  }, [requestedTab, requestedAgentId, clearRequested]);

  const members = org?.members ?? [];
  const detailMember =
    detailMemberId != null
      ? (members.find((m) => m.userId === detailMemberId) ?? null)
      : null;
  const detailAgent =
    detailAgentId != null
      ? (agents.find((a) => a.id === detailAgentId) ?? null)
      : null;

  // Member drill-in: one person, every agent. Back returns to the People list.
  if (tab === "people" && detailMember) {
    return (
      <AdminDetailScreen
        backLabel={t("permissions.tabs.people")}
        onBack={() => setDetailMemberId(null)}
      >
        <PageContainer className="pb-10">
          <MemberDetail member={detailMember} />
        </PageContainer>
      </AdminDetailScreen>
    );
  }

  // Agent drill-in: one agent's ceilings. Back returns to the Agents list.
  if (tab === "agents" && detailAgent) {
    return (
      <AdminDetailScreen
        backLabel={t("permissions.tabs.agents")}
        onBack={() => setDetailAgentId(null)}
      >
        <AgentDetail agent={detailAgent} />
      </AdminDetailScreen>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-10">
        <PageHeader
          title={t("permissions.title")}
          subtitle={t("permissions.subtitle")}
          className="mb-6 px-1"
        />
        <Tabs value={tab} onValueChange={(v) => setTab(v as PermissionsTab)}>
          <TabsList variant="line" className="mb-6">
            <TabsTrigger value="people">
              {t("permissions.tabs.people")}
            </TabsTrigger>
            <TabsTrigger value="agents">
              {t("permissions.tabs.agents")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="people">
            <PermissionsPeopleTab
              members={members}
              selfId={selfId}
              onOpenMember={(m) => setDetailMemberId(m.userId)}
            />
          </TabsContent>
          <TabsContent value="agents">
            <PermissionsAgentsTab
              members={members}
              onOpenAgent={(a) => setDetailAgentId(a.id)}
            />
          </TabsContent>
        </Tabs>
      </PageContainer>
    </div>
  );
}
