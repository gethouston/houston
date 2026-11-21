import type {
  TriggerPlanSkipAction,
  TriggerPlanSkipNotice,
} from "@houston/sdk";
import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { RoutineNoticeCard } from "./routine-notice-card";

interface Props {
  notice: TriggerPlanSkipNotice;
  onAction: (action: TriggerPlanSkipAction) => void;
  pending?: TriggerPlanSkipAction | null;
  layout?: "row" | "stacked";
  surface?: "card" | "inline";
  className?: string;
}

export function RoutinePlanSkipNoticeView({
  notice,
  onAction,
  pending = null,
  layout = "row",
  surface = "card",
  className,
}: Props) {
  const { t } = useTranslation("plan");
  const purchasable = canPurchaseInApp();
  const offersPlus = notice.actions.includes("upgrade");
  const actions = purchasable
    ? notice.actions
    : notice.actions.filter((action) => action !== "upgrade");

  const body = (): string => {
    switch (notice.reason) {
      case "min_interval":
        if (!offersPlus) return t("triggerSkipped.minIntervalNoOffer");
        return purchasable
          ? t("triggerSkipped.minInterval")
          : t("native.triggerSkipped.minInterval");
      case "routine_limit":
        if (!offersPlus) return t("triggerSkipped.routineLimitNoOffer");
        return purchasable
          ? t("triggerSkipped.routineLimit")
          : t("native.triggerSkipped.routineLimit");
      case "org_locked":
        return t("triggerSkipped.orgLocked");
      case "routine_limit_paused":
        return t("triggerSkipped.routineLimitPaused");
      case "inactive_paused":
        return t("triggerSkipped.inactivePaused");
      case "inactive_resumed":
        return t("triggerSkipped.inactiveResumed");
      case "creator_plan":
        return purchasable
          ? t("triggerSkipped.creatorPlan")
          : t("native.triggerSkipped.creatorPlan");
    }
  };
  const label = (action: TriggerPlanSkipAction): string => {
    switch (action) {
      case "upgrade":
        return t("upgrade");
      case "keep_routine":
        return t("chooseRoutine");
      case "resume":
        return t("resume");
    }
  };

  return (
    <RoutineNoticeCard
      data-testid="routine-plan-skip-notice"
      data-reason={notice.reason}
      tone={notice.reason === "inactive_resumed" ? "info" : "warning"}
      heading={t("triggerSkipped.title", { count: notice.count })}
      body={body()}
      surface={surface}
      layout={layout}
      className={className}
      actions={
        actions.length > 0 &&
        actions.map((action) => (
          <Button
            key={action}
            variant={action === "keep_routine" ? "secondary" : "default"}
            size="sm"
            className="active:scale-[0.96]"
            disabled={pending === action}
            onClick={() => onAction(action)}
          >
            {label(action)}
          </Button>
        ))
      }
    />
  );
}
