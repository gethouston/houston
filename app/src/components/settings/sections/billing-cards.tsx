import type { PlanSummary } from "@houston/engine-adapter";
import {
  billingCards,
  formatLaunchDate,
  formatLocalDate,
  formatLocalDateTime,
  planUsageMode,
  usagePercent,
} from "@houston/sdk";
import { Button, Card, Progress } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useResumeRoutines } from "../../../hooks/queries/use-plan";
import { useUIStore } from "../../../stores/ui";
import { FallbackLink } from "../../shell/fallback-link";
import { PlanPrice } from "./plan-price";

export function CurrentPlanCard({
  plan,
  onManage,
  managing,
  portalUrl,
}: {
  plan: PlanSummary;
  onManage: () => void;
  managing: boolean;
  /** The portal link to offer when no browser opened. */
  portalUrl: string | null;
}) {
  const { t, i18n } = useTranslation("plan");
  const cards = billingCards(plan);
  const date =
    plan.plus.renewsAt && formatLocalDate(plan.plus.renewsAt, i18n.language);
  return (
    <Card className="gap-0 px-5 py-5 md:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">
            {plan.plan === "free" ? t("freePlan") : t("plus")}
          </h2>
          {plan.plan === "free" ? (
            <p className="text-sm text-ink-muted">{t("freeEverywhere")}</p>
          ) : (
            <PlanPrice plan={plan} />
          )}
          {plan.plan === "plus" && cards.renewal !== "none" && (
            <p className="text-sm text-ink-muted">
              {cards.renewal === "paymentIssue"
                ? t("payment")
                : t(cards.renewal === "ends" ? "cancel" : "renew", {
                    date,
                  })}
            </p>
          )}
        </div>
        {cards.manage && (
          <Button variant="outline" disabled={managing} onClick={onManage}>
            {t("manage")}
          </Button>
        )}
      </div>
      {cards.manage && portalUrl && (
        <FallbackLink
          className="mt-4 self-start text-sm"
          href={portalUrl}
          command="plus_portal_open"
        >
          {t("openPortal")}
        </FallbackLink>
      )}
    </Card>
  );
}

export function UsageCard({ plan }: { plan: PlanSummary }) {
  const { t, i18n } = useTranslation("plan");
  const percent = usagePercent(plan) ?? 0;
  const preview = planUsageMode(plan) === "preview";
  const starts =
    plan.limitsStartAt && formatLaunchDate(plan.limitsStartAt, i18n.language);
  const usageLabel = preview
    ? t("previewUsage", { percent, date: starts })
    : t("usage", { percent });
  const routine = billingCards(plan).routine;
  const resume = useResumeRoutines();
  const choose = useUIStore((s) => s.setPlanKeepDialogOpen);
  return (
    <Card className="gap-5 px-5 py-5 md:px-6">
      <div className="space-y-3">
        <h2 className="text-lg font-medium">{t("usageTitle")}</h2>
        {preview && (
          <p className="text-xs text-ink-muted">
            {t("starts", { date: starts })}
          </p>
        )}
        <p className="text-sm tabular-nums">{usageLabel}</p>
        <Progress value={percent} aria-label={usageLabel} />
        <p className="text-sm text-ink-muted">
          {preview
            ? t("previewNote")
            : percent === 100 && plan.usage?.resetsAt
              ? t("reset", {
                  time: formatLocalDateTime(plan.usage.resetsAt, i18n.language),
                })
              : t("rollingWeek")}
        </p>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-5 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-ink-muted">
          {routine === "paused"
            ? t("pausedAway")
            : routine === "choose"
              ? t("routinesPaused", { count: plan.routines?.limitedCount ?? 0 })
              : t("keptRunning")}
        </p>
        {routine === "paused" && (
          <Button
            variant="outline"
            disabled={resume.isPending}
            onClick={() => resume.mutate()}
          >
            {t("resume")}
          </Button>
        )}
        {routine === "choose" && (
          <Button variant="outline" onClick={() => choose(true)}>
            {t("chooseRoutine")}
          </Button>
        )}
      </div>
    </Card>
  );
}
