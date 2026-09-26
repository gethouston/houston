import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { useTeams } from "../../hooks/use-teams";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useAgentActivitySummaries } from "../shell/use-agent-activity-summaries";
import { AgentHomeRowCell } from "./agent-home-row";
import { AgentsHomeHeader } from "./agents-home-header";
import {
  type AgentHomeRow,
  agentHomeFilterTeam,
  agentHomeRows,
  agentRowsForTeam,
} from "./agents-home-model";

/**
 * The mobile Agents home: every agent as a chat-list row — a large avatar
 * (a fanned stack when the agent holds several conversations), the name, the
 * latest task as the preview line, the time it moved and the needs-you badge.
 * Reads the same one-sweep `all-conversations` query and the same per-agent
 * summaries every other badge surface reads — no fetch path of its own — so
 * the rows repaint through the ordinary event invalidation.
 *
 * One FLAT list, narrowed by the group filter under the title (present once
 * the workspace has a group): every agent by default, or one group's. The
 * choice is a store preference, not a nav level, so drilling into an agent and
 * back finds the filter where it was left. The title block
 * ({@link AgentsHomeHeader}) also carries the phone's group actions.
 *
 * Tapping an agent adopts it as current (the same subject-acquisition the rail's
 * agent rows perform) and pushes its task list on the nav stack.
 */
export function AgentsHomeList() {
  const { t } = useTranslation(["shell", "teams"]);
  const agents = useAgentStore((s) => s.agents);
  const teams = useTeams();
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const teamId = useUIStore((s) => s.agentsHomeTeamId);
  const setTeamId = useUIStore((s) => s.setAgentsHomeTeamId);

  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations } = useAllConversations(rosterPaths);
  const summaries = useAgentActivitySummaries(agents);
  const swept = conversations !== undefined;

  const team = agentHomeFilterTeam(teams, teamId);
  const rows = useMemo(
    () =>
      agentRowsForTeam(agentHomeRows(agents, conversations, summaries), team),
    [agents, conversations, summaries, team],
  );

  const openRow = (row: AgentHomeRow) => {
    const full = useAgentStore
      .getState()
      .agents.find((a) => a.id === row.agent.id);
    if (full) useAgentStore.getState().setCurrent(full);
    openAgentsHome(row.agent.id);
  };

  return (
    <div data-testid="agents-home" className="flex h-full flex-col">
      <AgentsHomeHeader teams={teams} selected={team} onSelect={setTeamId} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {agents.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("shell:agentsHome.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("shell:agentsHome.empty.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : team !== null && team.agents.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>
                {t("teams:phoneEmployee.emptyGroup.title")}
              </EmptyTitle>
              <EmptyDescription>
                {t("teams:phoneEmployee.emptyGroup.description")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : swept ? (
          <ul>
            {rows.map((row) => (
              // The divider is the list's: one hairline under each row but the
              // last, inset the same distance from both screen edges.
              <li
                key={row.agent.id}
                className="mx-4 border-b border-line last:border-b-0"
              >
                <AgentHomeRowCell row={row} onOpen={openRow} />
              </li>
            ))}
          </ul>
        ) : (
          <div aria-hidden>
            {agents.map((agent) => (
              <AgentsHomeRowSkeleton key={agent.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Placeholder mirroring {@link AgentHomeRowCell}'s two-line track while the
 *  sweep has no data at all yet, so the list never claims agents are idle. */
function AgentsHomeRowSkeleton() {
  return (
    <div className="mx-4 flex items-center gap-3 border-b border-line last:border-b-0">
      <Skeleton className="size-[52px] shrink-0 rounded-full" />
      <div className="flex min-h-[4.5rem] flex-1 flex-col justify-center gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
    </div>
  );
}
