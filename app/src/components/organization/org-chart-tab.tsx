import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  useIsMobile,
} from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { openAgentBoard } from "../../lib/open-agent";
import { OrgChartHero } from "./org-chart-hero";
import { OrgChartLedger } from "./org-chart-ledger";
import { OrgChartRetryLine } from "./org-chart-retry-line";
import { OrgChartShareDialog } from "./org-chart-share-dialog";
import { OrgChartSkeleton } from "./org-chart-skeleton";
import { OrgChartTreeView } from "./org-chart-tree-view";
import { useOrgNav } from "./org-nav-store";
import type { OrgTabProps } from "./organization-view";
import { useOrgChartData } from "./use-org-chart-data";

/**
 * Admin > Org chart: the space's month in one hero band (its hours of
 * work, its messages, a 30-day chart), the chart itself (the space, its
 * people, each person's AI Employees) with its Share image, then every AI
 * Employee ranked by the hours it worked, the #1 featured, each with the people who
 * manage and use it. A line opens its board; a face opens People on that
 * person. A read that fails says so once with a retry instead of drawing
 * zeroes. A personal space is its one person: the hero names them and the
 * ledger draws no people columns.
 */
export default function OrgChartTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const isMobile = useIsMobile();
  const requestPerson = useOrgNav((store) => store.requestPerson);
  const chart = useOrgChartData(ctx);
  const [sharing, setSharing] = useState(false);

  if (chart.state === "loading")
    return <OrgChartSkeleton label={t("orgChart.loading")} />;
  if (chart.state === "empty")
    return (
      <Empty className="mt-6">
        <EmptyHeader>
          <EmptyTitle>{t("orgChart.empty")}</EmptyTitle>
          <EmptyDescription>{t("orgChart.emptyBody")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const failures = [
    chart.reads.hours === "error" && {
      id: "hours",
      message: t("orgChart.hoursUnavailable"),
      retry: chart.retry.hours,
    },
    chart.reads.messages === "error" && {
      id: "messages",
      message: t("orgChart.messagesUnavailable"),
      retry: chart.retry.messages,
    },
  ].flatMap((failure) => (failure ? [failure] : []));

  return (
    <div className="flex flex-col gap-7 md:gap-10">
      <OrgChartHero
        title={chart.title}
        lead={chart.lead}
        figures={chart.figures}
        series={chart.series}
      />
      {failures.length > 0 && (
        <div className="-mt-3 flex flex-col gap-1 md:-mt-6">
          {failures.map((failure) => (
            <OrgChartRetryLine
              key={failure.id}
              message={failure.message}
              retryLabel={t("orgChart.retry")}
              onRetry={failure.retry}
            />
          ))}
        </div>
      )}
      <OrgChartTreeView
        tree={chart.trees.screen}
        phone={isMobile}
        onOpenBoard={openAgentBoard}
        onOpenPerson={requestPerson}
        onShare={() => {
          analytics.track("org_chart_share_opened", {
            agent_count: chart.trees.share.counts.agents,
            people_count: chart.trees.share.counts.people,
          });
          setSharing(true);
        }}
      />
      <OrgChartShareDialog
        tree={chart.trees.share}
        open={sharing}
        onOpenChange={setSharing}
      />
      <OrgChartLedger
        lines={chart.lines}
        columns={chart.columns}
        phone={isMobile}
        onOpenBoard={openAgentBoard}
        onOpenPerson={requestPerson}
      />
    </div>
  );
}
