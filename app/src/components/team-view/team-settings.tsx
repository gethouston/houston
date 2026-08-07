import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isMultiplayer } from "../../lib/org-roles";
import type { TeamView } from "../../lib/teams-model.ts";
import { useAgentStore } from "../../stores/agents";
import { AgentDetail } from "../permissions/agent-detail";
import { BackBarScreen } from "../shell/back-bar-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { TeamAgentsList } from "./team-agents-list";

/**
 * A team's settings: the team, and the agents in it. Opening one drills into
 * the canonical agent settings page (Context + Permissions in one rail), the
 * SAME surface Settings > Permissions opens, so an agent is configured in one
 * place no matter which door the user came through.
 *
 * The drill-in is held as an agent ID, not a snapshot, so a share mutation that
 * reloads the agent store keeps the page pointed at live data; if the agent
 * disappears, the list comes back. Read-only for anyone who does not manage the
 * agent is `AgentDetail`'s own rule — the gateway is the real enforcer.
 *
 * Only mounted for callers who pass `canSeeTeamSettings`; the team view resolves
 * a stale request back to Mission Control before this ever renders.
 */
export function TeamSettings({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: org } = useOrg(isMultiplayer(capabilities));
  const agents = useAgentStore((s) => s.agents);
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);

  const detailAgent =
    openAgentId === null
      ? null
      : (agents.find((a) => a.id === openAgentId) ?? null);

  if (detailAgent) {
    return (
      <BackBarScreen backLabel={team.name} onBack={() => setOpenAgentId(null)}>
        <AgentDetail agent={detailAgent} />
      </BackBarScreen>
    );
  }

  return (
    <div className="h-full overflow-y-auto [scrollbar-gutter:stable]">
      <PageContainer className="py-10">
        <PageHeader
          title={team.name}
          // No subtitle on an empty team: "open one to manage it" would promise
          // agents that are not there, and the list's own line already says so.
          subtitle={
            team.agents.length === 0
              ? undefined
              : t("teamView.settings.subtitle")
          }
          className="mb-8 px-1"
        />
        <TeamAgentsList
          agents={team.agents}
          isDefaultTeam={team.isDefault}
          members={org?.members ?? []}
          onOpenAgent={(agent) => setOpenAgentId(agent.id)}
        />
      </PageContainer>
    </div>
  );
}
