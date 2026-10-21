/**
 * RoutinePlanSkipNotice — tells a person that a free org's rules refused some
 * of a trigger routine's runs, which never reach the history and would
 * otherwise leave the routine looking broken. Mounted on the routine screen
 * and at the top of its runs dialog, where people look for the missing run.
 *
 * This feeds the SDK the active org's billing, the creator, the signed-in
 * viewer and the routine's agent (`triggerPlanSkipNotice`); a teammate gets
 * the read-only variant.
 *
 * It reads the SAME per-agent trigger-status cache entry as the activation
 * chip (`agentTriggerStatusQueryOptions`), without the chip's error toast so a
 * failed read is reported once. Mounting it (opening the dialog) refetches a
 * stale entry and window focus refetches it, so no polling of its own.
 */

import type { Routine } from "@houston/engine-adapter";
import { triggerPlanSkipNotice } from "@houston/sdk";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
import { useResumeRoutines } from "../../hooks/queries/use-plan";
import { agentTriggerStatusQueryOptions } from "../../hooks/queries/use-triggers";
import { useSession } from "../../hooks/use-session";
import { useUIStore } from "../../stores/ui";
import { RoutinePlanSkipNoticeControls } from "./routine-plan-skip-notice-controls";

interface Props {
  agentId: string;
  routine: Routine;
  /** Runs before an action that navigates away or opens another dialog, so a
   *  hosting dialog can close first. */
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
  const { billing, plusOffer } = useActiveOrgBilling();
  const { data: session } = useSession();
  const openSettings = useUIStore((s) => s.openSettings);
  const openKeepChooser = useUIStore((s) => s.setPlanKeepDialogOpen);
  const resume = useResumeRoutines();

  const notice = triggerPlanSkipNotice(
    status.data?.find((item) => item.routine_id === routine.id),
    billing,
    {
      createdBy: routine.created_by,
      viewerId: session?.uid,
      // A hosted agent's client-side id IS its gateway slug.
      agentSlug: agentId,
      plusOffer,
    },
  );
  if (!notice) return null;

  return (
    <RoutinePlanSkipNoticeControls
      notice={notice}
      effects={{
        openBilling: () => openSettings("plan"),
        openKeepChooser: () => openKeepChooser(true),
        // A failure is surfaced by the engine call itself (`tauriOrg`).
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
