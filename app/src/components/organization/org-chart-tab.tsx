import type { OrgMember } from "@houston/engine-adapter";
import { Empty, EmptyTitle } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgentTeams, useOrgUsage } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSession } from "../../hooks/use-session";
import { useTeams } from "../../hooks/use-teams";
import { hasAgentTeams } from "../../lib/org-roles";
import { useAgentStore } from "../../stores/agents";
import { CARD_GRID, ChartSkeleton } from "./org-chart-cards";
import { orgChartUsage } from "./org-chart-model";
import { OrgChartRetryLine } from "./org-chart-retry-line";
import { OrgChartTeamCard } from "./org-chart-team-card";
import {
  orgChartRoster,
  orgChartScale,
  orgChartTeamOrder,
  orgChartTeamsState,
  orgChartUsageState,
} from "./org-chart-view-model";
import type { OrgTabProps } from "./organization-view";

/**
 * Admin > Org chart: every team of the space with the humans in it and the
 * agents it runs, each agent carrying its share of the last 30 days of
 * messages.
 *
 * It is the one screen that answers "who works here" with both kinds of worker
 * in the same frame, so the two are drawn in the same row grammar — a face, a
 * name, a number — and the bars are scaled to ONE busiest agent across the
 * whole chart rather than per card, which is what makes two cards comparable.
 *
 * Usage is owner/admin-only (the gateway 403s anyone else), and a caller
 * without it gets the chart with no numbers at all rather than a page of
 * zeroes: the counts, the bars and the window caption disappear together.
 */
export default function OrgChartTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const teams = useTeams();
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  // The same cache entry `useTeams` composes from; read here for the one thing
  // a composed TeamView[] cannot carry, which is whether the read landed.
  const {
    isLoading: teamsLoading,
    isError: teamsError,
    refetch: refetchTeams,
  } = useAgentTeams(serverBacked);
  const { data: session } = useSession();
  const permitted = ctx.role === "owner" || ctx.role === "admin";
  const { data: rows, isLoading, isError, refetch } = useOrgUsage(permitted);

  const cards = useMemo(() => orgChartTeamOrder(teams), [teams]);
  const usage = useMemo(
    () =>
      orgChartUsage(
        cards.flatMap((team) => team.agents),
        rows ?? [],
      ),
    [cards, rows],
  );
  const scale = orgChartScale(usage.byAgent);
  const state = orgChartUsageState({ permitted, isLoading, isError });

  const selfId = session?.uid ?? null;
  const self: OrgMember | null = useMemo(
    () =>
      session
        ? {
            userId: session.uid,
            role: ctx.role,
            displayName: session.displayName ?? undefined,
            email: session.email || undefined,
            photoUrl: session.photoUrl ?? undefined,
          }
        : null,
    [session, ctx.role],
  );
  const roster = useMemo(
    () =>
      orgChartRoster({
        personal: ctx.isPersonal,
        roster: ctx.org.members ?? [],
        self,
      }),
    [ctx.isPersonal, ctx.org.members, self],
  );

  const teamsState = orgChartTeamsState({
    agentsLoaded,
    teamsLoading,
    teamsError,
    teamCount: cards.length,
  });

  if (teamsState === "loading")
    return (
      <div className="mt-2">
        <ChartSkeleton label={t("orgChart.loading")} />
      </div>
    );

  // "No teams yet" is a claim about the company, so a failed read says what
  // actually happened and offers the way to try again.
  if (teamsState === "error")
    return (
      <OrgChartRetryLine
        className="mt-6"
        message={t("orgChart.teamsUnavailable")}
        retryLabel={t("orgChart.retry")}
        onRetry={() => void refetchTeams()}
      />
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
        {cards.map((team) => (
          <OrgChartTeamCard
            key={team.id}
            team={team}
            roster={roster}
            personal={ctx.isPersonal}
            serverBacked={serverBacked}
            selfId={selfId}
            usage={usage}
            scale={scale}
            state={state}
          />
        ))}
      </ul>
    </div>
  );
}
