/**
 * The look of the "your plan skipped this routine's events" notice: why
 * (the SDK's `triggerPlanSkipNotice` decides the reason and the actions) and
 * one button per action. Props only, so the routine screen and the runs
 * dialog draw the same thing and a test can render it without a query.
 *
 * The store apps never sell (`canPurchaseInApp`): there Upgrade is dropped
 * and the copy that pointed to Plus says the plan is managed on the web.
 */

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
  /** The action in flight (Resume), disabled until it settles. */
  pending?: TriggerPlanSkipAction | null;
  /** `row` puts the actions beside the text from the desktop edge up (the
   *  routine screen); `stacked` keeps them under it at every width (the
   *  narrow runs dialog). */
  layout?: "row" | "stacked";
  /** `inline` inside a dialog that already frames it (the runs dialog). */
  surface?: "card" | "inline";
  /** Width and spacing from the mount. */
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
  const actions = purchasable
    ? notice.actions
    : notice.actions.filter((action) => action !== "upgrade");

  // Spelled out per reason rather than built from it: `t()` keys are typed,
  // so a template-literal key would compile past a typo.
  const body = (): string => {
    switch (notice.reason) {
      case "min_interval":
        return purchasable
          ? t("triggerSkipped.minInterval")
          : t("native.triggerSkipped.minInterval");
      case "routine_limit":
        return purchasable
          ? t("triggerSkipped.routineLimit")
          : t("native.triggerSkipped.routineLimit");
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
            // The way out (Upgrade, Resume) is the filled pill, like the
            // sidebar's Upgrade chip; choosing a routine is the quiet one.
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
