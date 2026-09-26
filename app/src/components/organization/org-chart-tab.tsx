import { Empty, EmptyTitle } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrgUsage } from "../../hooks/queries";
import {
  useSidebarLayoutLoaded,
  useSidebarLayoutValue,
} from "../../hooks/use-sidebar-layout";
import { useTeams } from "../../hooks/use-teams";
import { resolveSidebarSections } from "../../lib/agent-order";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { CARD_GRID, ChartSkeleton } from "./org-chart-cards";
import { orgChartUsage } from "./org-chart-model";
import { OrgChartRetryLine } from "./org-chart-retry-line";
import { OrgChartTeamCard } from "./org-chart-team-card";
import {
  orgChartCardOrder,
  orgChartScale,
  orgChartTeamsState,
  orgChartUsageState,
} from "./org-chart-view-model";
import type { OrgTabProps } from "./organization-view";

export default function OrgChartTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const teams = useTeams();
  const agents = useAgentStore((store) => store.agents);
  const agentsLoaded = useAgentStore((store) => store.loaded);
  const workspaceId = useWorkspaceStore((store) => store.current?.id);
  const layout = useSidebarLayoutValue(workspaceId);
  const layoutReady = useSidebarLayoutLoaded(workspaceId);
  const ungrouped = useMemo(
    () => resolveSidebarSections(agents, layout).ungrouped,
    [agents, layout],
  );
  const permitted = ctx.role === "owner" || ctx.role === "admin";
  const { data: rows, isLoading, isError, refetch } = useOrgUsage(permitted);
  const chartAgents = useMemo(
    () => [...ungrouped, ...teams.flatMap((team) => team.agents)],
    [ungrouped, teams],
  );
  const usage = useMemo(
    () => orgChartUsage(chartAgents, rows ?? []),
    [chartAgents, rows],
  );
  const scale = orgChartScale(usage.byAgent);
  const state = orgChartUsageState({ permitted, isLoading, isError });
  const teamsState = orgChartTeamsState({
    agentsLoaded,
    teamCount: teams.length + (ungrouped.length > 0 ? 1 : 0),
  });

  if (!layoutReady || teamsState === "loading")
    return (
      <div className="mt-2">
        <ChartSkeleton label={t("orgChart.loading")} />
      </div>
    );
  if (teamsState === "empty")
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("orgChart.empty")}</EmptyTitle>
      </Empty>
    );

  return (
    <div className="mt-2 flex flex-col gap-4">
      {state === "error" ? (
        <OrgChartRetryLine
          message={t("orgChart.usageUnavailable")}
          retryLabel={t("orgChart.retry")}
          onRetry={() => void refetch()}
        />
      ) : state === "hidden" ? null : (
        <p className="text-sm text-ink-muted">{t("orgChart.window")}</p>
      )}
      <ul className={CARD_GRID}>
        {orgChartCardOrder(
          ungrouped.length,
          teams.map((team) => team.id),
        ).map((id) => {
          const team = teams.find((item) => item.id === id);
          return (
            <OrgChartTeamCard
              key={id ?? "ungrouped"}
              team={team}
              agents={team?.agents ?? ungrouped}
              usage={usage}
              scale={scale}
              state={state}
            />
          );
        })}
      </ul>
    </div>
  );
}
