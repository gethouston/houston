import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@houston-ai/core";
import { UserRoundPlus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useTeams } from "../../hooks/use-teams";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHero } from "../shell/page-shell";
import { useAgentActivitySummaries } from "../shell/use-agent-activity-summaries";
import { tourAnchor } from "../shell/workspace-tour-steps";
import { AgentHomeRowCell } from "./agent-home-row";
import {
  type AgentHomeRow,
  agentHomeFilterTeam,
  agentHomeHasTeamFilter,
  agentHomeRows,
  agentRowsForTeam,
} from "./agents-home-model";
import { AgentsHomeTeamFilter } from "./agents-home-team-filter";

/**
 * The mobile Agents home: every agent as a chat-list row — a large avatar
 * (a fanned stack when the agent holds several conversations), the name, the
 * latest task as the preview line, the time it moved and the needs-you badge.
 * Reads the same one-sweep `all-conversations` query and the same per-agent
 * summaries every other badge surface reads — no fetch path of its own — so
 * the rows repaint through the ordinary event invalidation.
 *
 * One FLAT list, narrowed by a team selector under the title (present only
 * when the workspace has more than one team): every agent of every team by
 * default, or one team's. The choice is a store preference, not a nav level,
 * so drilling into an agent and back finds the filter where it was left.
 *
 * Tapping an agent adopts it as current (the same subject-acquisition the rail's
 * agent rows perform) and pushes its task list on the nav stack.
 */
export function AgentsHomeList() {
  const { t } = useTranslation("shell");
  const agents = useAgentStore((s) => s.agents);
  const teams = useTeams();
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const teamId = useUIStore((s) => s.agentsHomeTeamId);
  const setTeamId = useUIStore((s) => s.setAgentsHomeTeamId);
  const { canCreate } = useCanCreateAgents();

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
      <PageContainer className="shrink-0 pt-6">
        <PageHero
          title={t("agentsHome.title")}
          className="mb-3"
          trailing={
            canCreate ? (
              <NewAgentButton label={t("sidebar.addAgent")} />
            ) : undefined
          }
        />
        {agentHomeHasTeamFilter(teams) && (
          <div className="mb-2">
            <AgentsHomeTeamFilter
              teams={teams}
              selected={team}
              onSelect={setTeamId}
            />
          </div>
        )}
      </PageContainer>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {agents.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>{t("agentsHome.empty.title")}</EmptyTitle>
              <EmptyDescription>
                {t("agentsHome.empty.description")}
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

/**
 * The phone's create-agent control. The desktop reaches the same dialog from
 * the rail's own `newAgent` anchor; the rail is not rendered below md, so this
 * carries the anchor there and the spotlight takes whichever is visible.
 */
function NewAgentButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid="agents-home-new-agent"
      {...tourAnchor("newAgent")}
      onClick={() => useUIStore.getState().setCreateAgentDialogOpen(true)}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors active:scale-[0.96] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ht-hairline"
    >
      <UserRoundPlus className="size-5" />
    </button>
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
