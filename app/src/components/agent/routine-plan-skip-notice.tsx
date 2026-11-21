import type { Routine } from "@houston/engine-adapter";
import { triggerPlanSkipNotice } from "@houston/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { useResumeRoutines } from "../../hooks/queries/use-plan";
import { agentTriggerStatusQueryOptions } from "../../hooks/queries/use-triggers";
import { useSession } from "../../hooks/use-session";
import { openAdmin } from "../../lib/open-admin";
import { useUIStore } from "../../stores/ui";
import { RoutinePlanSkipNoticeControls } from "./routine-plan-skip-notice-controls";

interface Props {
  agentId: string;
  routine: Routine;
  onLeave?: () => void;
  layout?: "row" | "stacked";
  surface?: "card" | "inline";
  className?: string;
}

export function RoutinePlanSkipNotice({
  agentId,
  routine,
  onLeave,
  layout,
  surface,
  className,
}: Props) {
  const routineIds = useMemo(() => [routine.id], [routine.id]);
  const status = useQuery({
    ...agentTriggerStatusQueryOptions(agentId, routineIds),
    enabled: !!routine.trigger,
  });
  const { billing, upgradeOffer } = useActiveOrgBilling();
  const { data: session } = useSession();
  const openKeepChooser = useUIStore((s) => s.setPlanKeepDialogOpen);
  const resume = useResumeRoutines();

  const notice = triggerPlanSkipNotice(
    status.data?.find((item) => item.routine_id === routine.id),
    billing,
    {
      createdBy: routine.created_by,
      viewerId: session?.uid,
      agentSlug: agentId,
      plusOffer: upgradeOffer,
    },
  );
  if (!notice) return null;

  return (
    <RoutinePlanSkipNoticeControls
      notice={notice}
      effects={{
        openBilling: () => openAdmin({ section: "billing" }),
        openKeepChooser: () => openKeepChooser(true),
        resume: () => resume.mutate(),
        resuming: resume.isPending,
      }}
      onLeave={onLeave}
      layout={layout}
      surface={surface}
      className={className}
    />
  );
}
