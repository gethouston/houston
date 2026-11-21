import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  useIsMobile,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { openAgentBoard } from "../../lib/open-agent";
import { OrgChartHero } from "./org-chart-hero";
import { OrgChartLedger } from "./org-chart-ledger";
import { OrgChartRetryLine } from "./org-chart-retry-line";
import { OrgChartSkeleton } from "./org-chart-skeleton";
import { OrgChartTreeShare } from "./org-chart-tree-share";
import { useOrgNav } from "./org-nav-store";
import type { OrgTabProps } from "./organization-view";
import { useOrgChartData } from "./use-org-chart-data";

export default function OrgChartTab({ ctx }: OrgTabProps) {
  const { t } = useTranslation("teams");
  const isMobile = useIsMobile();
  const requestPerson = useOrgNav((store) => store.requestPerson);
  const chart = useOrgChartData(ctx);

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
      <OrgChartTreeShare
        tree={chart.trees.screen}
        phone={isMobile}
        onOpenBoard={openAgentBoard}
        onOpenPerson={requestPerson}
        shareTree={chart.trees.share}
      />
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
