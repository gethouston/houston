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
import {
  type AgentHomeRow,
  agentHomeRows,
  agentTreeSections,
} from "./agents-home-model";
import { AgentsTree } from "./agents-home-tree";

/**
 * The mobile Agents home: every agent as one line, grouped under the team it
 * belongs to. Reads the same one-sweep `all-conversations` query and the same
 * per-agent summaries every other badge surface reads — no fetch path of its
 * own — so the rows repaint through the ordinary event invalidation.
 *
 * No name filter: the tree is the finder. Grouping by team is what keeps a
 * long roster scannable, and a search field above a list this short would take
 * the screen's first row to save a scroll.
 *
 * Tapping an agent adopts it as current (the same subject-acquisition the rail's
 * agent rows perform) and pushes its task list on the nav stack.
 */
export function AgentsHomeList() {
  const { t } = useTranslation("shell");
  const agents = useAgentStore((s) => s.agents);
  const teams = useTeams();
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const { canCreate } = useCanCreateAgents();

  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations } = useAllConversations(rosterPaths);
  const summaries = useAgentActivitySummaries(agents);
  const swept = conversations !== undefined;

  const sections = useMemo(
    () =>
      agentTreeSections(teams, agentHomeRows(agents, conversations, summaries)),
    [agents, conversations, summaries, teams],
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
          className="mb-4 px-3"
          trailing={
            canCreate ? (
              <NewAgentButton label={t("sidebar.addAgent")} />
            ) : undefined
          }
        />
      </PageContainer>
      <PageContainer className="min-h-0 flex-1 overflow-y-auto pb-6">
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
          <AgentsTree sections={sections} onOpen={openRow} />
        ) : (
          <div aria-hidden>
            {agents.map((agent) => (
              <AgentsHomeRowSkeleton key={agent.id} />
            ))}
          </div>
        )}
      </PageContainer>
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

/** Placeholder mirroring {@link AgentHomeRowCell}'s one-line track while the
 *  sweep has no data at all yet, so the list never claims agents are idle. */
function AgentsHomeRowSkeleton() {
  return (
    <div className="flex min-h-12 w-full items-center gap-3 px-3">
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}
