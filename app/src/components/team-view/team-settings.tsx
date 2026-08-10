import { Button, CatalogSectionHeader } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { isMultiplayer } from "../../lib/org-roles";
import type { TeamView } from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";
import { AgentDetail } from "../permissions/agent-detail";
import { PageContainer } from "../shell/page-shell";
import { ManageTeamHeader } from "./manage-team-header";
import { type ManageTeamPaneId, manageTeamPanes } from "./manage-team-panes";
import { TeamAgentsList } from "./team-agents-list";
import { TeamContextCard } from "./team-context-card";
import { TeamMembersCard } from "./team-members-card";
import { useTeamSettingsNav } from "./team-settings-nav-store";

/**
 * Standalone Team settings screen, reached from the rail's manager-gated row.
 * Its lozenge cluster owns Agents, Team context, and People; the landing Agents
 * pane drills into the canonical agent settings page. Name editing remains in
 * the rail menu.
 *
 * The drill-in stores an agent ID so store refreshes retain live data. A
 * one-shot `useTeamSettingsNav` request always lands in Agents with that detail
 * open, then clears itself so later rail visits return to the list.
 */
export function TeamSettings({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: org } = useOrg(isMultiplayer(capabilities));
  const personalSpace = usePersonalSpace();
  const agents = useAgentStore((s) => s.agents);
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );
  const { canCreate } = useCanCreateAgents();
  const panes = manageTeamPanes(team, personalSpace);
  // `null` until the user picks: the screen lands on the FIRST pane the team
  // offers (context when it exists), and a stale pick falls back the same way.
  const [active, setActive] = useState<ManageTeamPaneId | null>(null);
  const resolvedActive =
    active !== null && panes.includes(active) ? active : panes[0];
  const [open, setOpen] = useState<{
    agentId: string;
    section: AgentSettingsSection | undefined;
  } | null>(null);

  const requestedAgentId = useTeamSettingsNav((s) => s.requestedAgentId);
  const requestedSection = useTeamSettingsNav((s) => s.requestedSection);
  const clearRequested = useTeamSettingsNav((s) => s.clearRequested);

  useEffect(() => {
    if (requestedAgentId === null) return;
    setActive("agents");
    setOpen({
      agentId: requestedAgentId,
      section: requestedSection ?? undefined,
    });
    clearRequested();
  }, [requestedAgentId, requestedSection, clearRequested]);

  const detailAgent =
    open === null ? null : (agents.find((a) => a.id === open.agentId) ?? null);
  if (open && detailAgent) {
    return (
      <AgentDetail
        agent={detailAgent}
        teamName={team.name}
        initialSection={open.section}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ManageTeamHeader
        active={resolvedActive}
        panes={panes}
        teamName={team.name}
        onSelect={setActive}
      />
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer className="py-8" data-manage-pane={resolvedActive}>
          {resolvedActive === "agents" && (
            <section>
              <div className="mb-1 flex items-center justify-between gap-4">
                <CatalogSectionHeader title={t("teamView.manage.agents")} />
                {canCreate && (
                  <Button
                    size="sm"
                    onClick={() => setCreateAgentDialogOpen(true, team.id)}
                  >
                    <Plus className="size-4" />
                    {t("agentTeams.create.newAgent")}
                  </Button>
                )}
              </div>
              {team.agents.length > 0 && (
                <p className="mb-4 text-sm text-ink-muted">
                  {t("teamView.settings.subtitle")}
                </p>
              )}
              <TeamAgentsList
                agents={team.agents}
                teamId={team.id}
                isDefaultTeam={team.isDefault}
                members={org?.members ?? []}
                onOpenAgent={(agent) =>
                  setOpen({ agentId: agent.id, section: undefined })
                }
              />
            </section>
          )}
          {resolvedActive === "context" && <TeamContextCard team={team} />}
          {resolvedActive === "people" && (
            <TeamMembersCard team={team} roster={org?.members ?? []} />
          )}
        </PageContainer>
      </div>
    </div>
  );
}
