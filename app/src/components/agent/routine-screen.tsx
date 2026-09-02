/**
 * RoutineScreen — a routine's own page (PRODUCT-1208), REPLACING the tab's
 * main content (the list) when a row is clicked; never a side panel, never a
 * popover. The user can read AND edit here: the name (in-place rename), the
 * description (the routine's prompt, in a plain textarea) and the run
 * frequency (the same schedule builder the rows use). "Runs" opens the
 * execution history in a modal; "Open chat" continues to the setup chat in
 * the shell panel. Layout only — the header and sections own their pieces.
 */

import type { Routine, RoutineUpdate } from "@houston-ai/engine-client";
import type { RoutineRun } from "@houston-ai/routines";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineWritesForAnyAgent } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { genericErrorDescription } from "../../lib/error-report";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { RoutineRunsDialog } from "./routine-runs-dialog";
import { RoutineScreenHeader } from "./routine-screen-header";
import { RoutineScreenSections } from "./routine-screen-sections";

interface Props {
  agent: Agent;
  routine: Routine;
  /** ALL of the agent's runs (the tab's cached query); filtered here. */
  allRuns: RoutineRun[] | undefined;
  runsLoading: boolean;
  /** Humanized event summary for a trigger routine (useRoutineTriggers). */
  triggerSummary?: string;
  /** The account-wide zone cron schedules fire in. */
  accountTimezone: string;
  /** Whether Escape should leave the screen (false while a chat panel is the
   *  active surface — its own Escape handler owns the key then). */
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
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const addToast = useUIStore((s) => s.addToast);
  const { update: updateRoutine } = useRoutineWritesForAnyAgent();
  const [runsOpen, setRunsOpen] = useState(false);

  const save = (updates: RoutineUpdate) =>
    updateRoutine.mutate(
      { agentPath: agent.folderPath, routineId: routine.id, updates },
      {
        onError: (err) =>
          addToast({
            title: t("toasts.updateError"),
            description: genericErrorDescription("update_routine", err),
            variant: "error",
          }),
      },
    );

  // Escape leaves the screen (back to the list) — same key convention as the
  // panes — but only while this screen is the active surface.
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
        runs={allRuns?.filter((run) => run.routine_id === routine.id)}
        runsLoading={runsLoading}
        locale={labels.locale}
        onOpenRun={(run) => {
          setRunsOpen(false);
          onOpenRun(run);
        }}
      />
    </div>
  );
}
