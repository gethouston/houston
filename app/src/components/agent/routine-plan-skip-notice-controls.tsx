import type {
  TriggerPlanSkipAction,
  TriggerPlanSkipNotice,
} from "@houston/sdk";
import { RoutinePlanSkipNoticeView } from "./routine-plan-skip-notice-view";

export interface PlanSkipEffects {
  openBilling: () => void;
  openKeepChooser: () => void;
  resume: () => void;
  resuming: boolean;
}

interface Props {
  notice: TriggerPlanSkipNotice;
  effects: PlanSkipEffects;
  onLeave?: () => void;
  layout?: "row" | "stacked";
  surface?: "card" | "inline";
  className?: string;
}

export function RoutinePlanSkipNoticeControls({
  notice,
  effects,
  onLeave,
  layout,
  surface,
  className,
}: Props) {
  const onAction = (action: TriggerPlanSkipAction) => {
    switch (action) {
      case "upgrade":
        onLeave?.();
        effects.openBilling();
        return;
      case "keep_routine":
        onLeave?.();
        effects.openKeepChooser();
        return;
      case "resume":
        effects.resume();
        return;
    }
  };

  return (
    <RoutinePlanSkipNoticeView
      notice={notice}
      onAction={onAction}
      pending={effects.resuming ? "resume" : null}
      layout={layout}
      surface={surface}
      className={className}
    />
  );
}
