import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isMultiplayer } from "../../lib/org-roles";
import { canRenameTeam, type TeamView } from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";
import { AgentDetail } from "../permissions/agent-detail";
import { BackBarScreen } from "../shell/back-bar-screen";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { TeamAgentsList } from "./team-agents-list";
import { TeamMembersCard } from "./team-members-card";
import { TeamNameField } from "./team-name-field";
import { useTeamSettingsNav } from "./team-settings-nav-store";

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
 * It also honors a ONE-SHOT deep link from {@link useTeamSettingsNav} — a turn
 * summary's "the agent updated its job description" link opens straight into
 * that agent, on that section — and clears it, so a later plain click on the
 * team's Settings row lands back on the agent list.
 *
 * Mounted for callers who pass `visibleTeamSectionsForTeam` on THIS team: the
 * org owner/admin, or a member who manages at least one of its agents. That
 * member sees EVERY agent of the team in the list and may drill into any of
 * them — they edit the ones they manage and get the read-only face on the rest,
 * which is the same asymmetry an admin already sees. The team view resolves a
 * request this caller fails back to Mission Control before this ever renders.
 *
 * On a SERVER-teams host (`team.server`) the page grows the two surfaces a team
 * owns beyond its agents: the team's NAME, editable by its owner, and the
 * people who joined it. Neither exists on the local sidebar backend, where a
 * team is one person's own grouping of their own agents, so both hang off the
 * presence of the server's facts and this page stays byte-identical there.
 */
export function TeamSettings({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const { data: org } = useOrg(isMultiplayer(capabilities));
  const agents = useAgentStore((s) => s.agents);
  const [open, setOpen] = useState<{
    agentId: string;
    section: AgentSettingsSection | undefined;
  } | null>(null);

  const requestedAgentId = useTeamSettingsNav((s) => s.requestedAgentId);
  const requestedSection = useTeamSettingsNav((s) => s.requestedSection);
  const clearRequested = useTeamSettingsNav((s) => s.clearRequested);

  useEffect(() => {
    if (requestedAgentId === null) return;
    setOpen({
      agentId: requestedAgentId,
      section: requestedSection ?? undefined,
    });
    clearRequested();
  }, [requestedAgentId, requestedSection, clearRequested]);

  const detailAgent =
    open === null ? null : (agents.find((a) => a.id === open.agentId) ?? null);
  // The C13 backend, and the ONE gate for everything below that only a
  // server-owned team has. `canRenameTeam` alone would not do: off-capability
  // it is true for every named sidebar group.
  const serverBacked = team.server !== undefined;

  if (open && detailAgent) {
    return (
      <BackBarScreen backLabel={team.name} onBack={() => setOpen(null)}>
        <AgentDetail agent={detailAgent} initialSection={open.section} />
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
        {serverBacked && canRenameTeam(team) && (
          // Keyed on the saved name so a rename landing (yours, or someone
          // else's) re-seeds the field instead of leaving stale text in it.
          <TeamNameField
            key={team.name}
            teamId={team.id}
            savedName={team.name}
          />
        )}
        <TeamAgentsList
          agents={team.agents}
          isDefaultTeam={team.isDefault}
          members={org?.members ?? []}
          onOpenAgent={(agent) =>
            setOpen({ agentId: agent.id, section: undefined })
          }
        />
        {serverBacked && (
          <TeamMembersCard team={team} roster={org?.members ?? []} />
        )}
      </PageContainer>
    </div>
  );
}
