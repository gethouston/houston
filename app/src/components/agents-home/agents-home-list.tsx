import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  Skeleton,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHero } from "../shell/page-shell";
import { useAgentActivitySummaries } from "../shell/use-agent-activity-summaries";
import { AgentHomeRowCell } from "./agent-home-row";
import {
  type AgentHomeRow,
  agentHomeRows,
  filterAgentRows,
} from "./agents-home-model";

/**
 * The mobile Agents home list: every agent as a two-line cell, attention-
 * sorted (needs-you first, then running, then recency), with a name filter
 * under the title. Reads the same one-sweep `all-conversations` query and the
 * same per-agent summaries every other badge surface reads — no fetch path of
 * its own — so the rows repaint through the ordinary event invalidation.
 *
 * Tapping an agent adopts it as current (the same subject-acquisition the
 * drawer's agent rows perform) and pushes its missions screen on the nav
 * stack.
 */
export function AgentsHomeList() {
  const { t } = useTranslation("shell");
  const agents = useAgentStore((s) => s.agents);
  const openAgentsHome = useUIStore((s) => s.openAgentsHome);
  const [query, setQuery] = useState("");

  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: conversations } = useAllConversations(rosterPaths);
  const summaries = useAgentActivitySummaries(agents);
  const previewsLoaded = conversations !== undefined;

  const rows = useMemo(
    () => agentHomeRows(agents, conversations, summaries),
    [agents, conversations, summaries],
  );
  const visibleRows = useMemo(
    () => filterAgentRows(rows, query),
    [rows, query],
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
        <PageHero title={t("agentsHome.title")} className="mb-4 px-3" />
        {agents.length > 0 && (
          <div className="mb-2 px-3">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("agentsHome.filterPlaceholder")}
              aria-label={t("agentsHome.filterPlaceholder")}
              data-testid="agents-home-filter"
              className="text-base"
            />
          </div>
        )}
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
        ) : visibleRows.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">
            {t("agentsHome.filterEmpty")}
          </p>
        ) : previewsLoaded ? (
          <ul>
            {visibleRows.map((row) => (
              <li key={row.agent.id}>
                <AgentHomeRowCell row={row} onOpen={openRow} />
              </li>
            ))}
          </ul>
        ) : (
          <div aria-hidden>
            {visibleRows.map((row) => (
              <AgentsHomeRowSkeleton key={row.agent.id} />
            ))}
          </div>
        )}
      </PageContainer>
    </div>
  );
}

/** Placeholder mirroring {@link AgentHomeRowCell}'s tracks while the sweep has
 *  no data at all yet, so the list never claims agents have no work. */
function AgentsHomeRowSkeleton() {
  return (
    <div className="flex min-h-14 w-full items-center gap-3 px-3 py-2">
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
