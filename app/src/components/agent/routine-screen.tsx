import type { Routine, RoutineUpdate } from "@houston/engine-adapter";
import type { RoutineRun } from "@houston-ai/routines";
import { useEffect, useState } from "react";
import { useRoutineWritesForAnyAgent } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { useRoutineReader } from "../../hooks/use-routine-provider-health";
import type { Agent } from "../../lib/types";
import { RoutineAutoPauseBanner } from "./routine-auto-pause-banner";
import { RoutinePlanSkipNotice } from "./routine-plan-skip-notice";
import { RoutineRunsDialog } from "./routine-runs-dialog";
import { RoutineScreenHeader } from "./routine-screen-header";
import { RoutineScreenSections } from "./routine-screen-sections";
import { RoutineSnoozeBanner } from "./routine-snooze-banner";

interface Props {
  agent: Agent;
  routine: Routine;
  allRuns: RoutineRun[] | undefined;
  runsLoading: boolean;
  triggerSummary?: string;
  accountTimezone: string;
  escapeActive: boolean;
  onBackToList: () => void;
  onOpenChat: () => void;
  onOpenRun: (run: RoutineRun) => void;
}

export function RoutineScreen({
  agent,
  routine,
  allRuns,
  runsLoading,
  triggerSummary,
  accountTimezone,
  escapeActive,
  onBackToList,
  onOpenChat,
  onOpenRun,
}: Props) {
  const labels = useRoutineLabels();
  const { update: updateRoutine } = useRoutineWritesForAnyAgent();
  const [runsOpen, setRunsOpen] = useState(false);
  const readerFor = useRoutineReader(routine.created_by);

  const save = (updates: RoutineUpdate) =>
    updateRoutine.mutate({
      agentPath: agent.folderPath,
      routineId: routine.id,
      updates,
    });

  useEffect(() => {
    if (!escapeActive) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        el.blur();
        return;
      }
      onBackToList();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [escapeActive, onBackToList]);

  return (
    <div data-testid="routine-screen" className="flex min-h-0 flex-1 flex-col">
      <RoutineScreenHeader
        agent={agent}
        routine={routine}
        onBackToList={onBackToList}
        onOpenRuns={() => setRunsOpen(true)}
        onOpenChat={onOpenChat}
        onRename={(name) => save({ name })}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 md:px-8">
        <RoutinePlanSkipNotice
          agentId={agent.id}
          routine={routine}
          className="mx-auto mb-6 max-w-3xl"
        />
        <RoutineAutoPauseBanner
          routine={routine}
          onResume={() => save({ enabled: true })}
          resuming={updateRoutine.isPending}
          readerFor={readerFor}
        />
        <RoutineSnoozeBanner routine={routine} />
        <RoutineScreenSections
          agent={agent}
          routine={routine}
          triggerSummary={triggerSummary}
          accountTimezone={accountTimezone}
          onSave={save}
          saving={updateRoutine.isPending}
        />
      </div>

      <RoutineRunsDialog
        open={runsOpen}
        onOpenChange={setRunsOpen}
        notice={
          <RoutinePlanSkipNotice
            agentId={agent.id}
            routine={routine}
            onLeave={() => setRunsOpen(false)}
            layout="stacked"
            surface="inline"
          />
        }
        runs={allRuns?.filter((run) => run.routine_id === routine.id)}
        runsLoading={runsLoading}
        locale={labels.locale}
        onOpenRun={(run) => {
          setRunsOpen(false);
          onOpenRun(run);
        }}
        readerFor={readerFor}
      />
    </div>
  );
}
