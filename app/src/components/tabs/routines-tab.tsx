import { RoutinesGrid } from "@houston-ai/routines";
import { useTranslation } from "react-i18next";
import { useRoutineRuns, useRoutines } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { analytics } from "../../lib/analytics";
import type { TabProps } from "../../lib/types";
import { HoustonLogo } from "../shell/agent-avatar";
import { RoutineSetupChat } from "./routine-setup-chat";
import { latestRunByRoutine } from "./routines-tab-model";
import { useRoutineChatSetup } from "./use-routine-chat-setup";
import { useRoutineTabHandlers } from "./use-routine-tab-handlers";
import { useRoutineTriggers } from "./use-routine-triggers";
import { useRoutinesTabView } from "./use-routines-tab-view";

/**
 * The Automations tab: everything the agent does on its own, in ONE list —
 * routines that wake on a cron schedule and routines that wake on an event in
 * a connected app (C9). The wake mechanism is a choice inside each editor
 * ("When should this happen?"), offered only where the deployment supports
 * event triggers (`capabilities.triggers` — `useRoutineTriggers` gates it), so
 * the tab itself is identical across deployments. Mutations live in
 * `useRoutineTabHandlers`.
 */
export default function RoutinesTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const path = agent.folderPath;

  const { data: routines, isLoading } = useRoutines(path);
  const { data: allRuns } = useRoutineRuns(path);
  const lastRuns = latestRunByRoutine(allRuns);

  const chatSetup = useRoutineChatSetup(agent, routines);
  const nav = useRoutinesTabView(agent, routines, chatSetup);
  const triggers = useRoutineTriggers(agent, routines, labels.trigger);
  const h = useRoutineTabHandlers(agent, nav.closeNewDraft);

  // Schedule rows render against the real account zone, so the list waits for
  // the timezone roundtrip once per open.
  if (!h.tz.loaded || !h.tz.timezone) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ink-muted animate-pulse">{t("loading")}</p>
      </div>
    );
  }

  const { view } = nav;
  if (view.type === "chat" || view.type === "chat-draft") {
    const routine =
      view.type === "chat"
        ? routines?.find((r) => r.id === view.routineId)
        : undefined;
    const activity =
      view.type === "chat"
        ? routine
          ? chatSetup.activityFor(routine)
          : null
        : view.activityId
          ? (chatSetup.draftActivities.find((a) => a.id === view.activityId) ??
            null)
          : null;
    return (
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={activity}
        kind={view.type === "chat" ? "routine" : "draft"}
        routineName={routine?.name}
        onBack={nav.backToGrid}
      />
    );
  }

  return (
    <RoutinesGrid
      routines={routines ?? []}
      lastRuns={lastRuns}
      draftActivities={chatSetup.draftActivities}
      newDraft={
        nav.newDraftOpen
          ? { onSave: h.handleNewDraftSave, onCancel: nav.closeNewDraft }
          : null
      }
      accountTimezone={h.tz.timezone ?? "UTC"}
      onTimezoneChange={h.handleTimezoneChange}
      loading={isLoading}
      onCreateWithAi={nav.handleCreateWithAi}
      onCreateManually={nav.handleCreateManually}
      // Plain .mutate: a rejected toggle/delete/stop would be an unhandled
      // rejection, and call() already toasts each failure.
      onToggle={(id, enabled) =>
        h.updateRoutine.mutate({ routineId: id, updates: { enabled } })
      }
      onSaveRoutine={h.handleSaveRoutine}
      onEditWithAi={nav.handleEditWithAi}
      onDeleteRoutine={(routineId) => h.deleteRoutine.mutate(routineId)}
      // Manual runs are the intentional analytics signal for usage.
      onRunNow={(routineId) => {
        analytics.track("routine_executed", { routine_id: routineId });
        h.runNow.mutate(routineId);
      }}
      onStopRun={(routineId, runId) => h.cancelRun.mutate({ routineId, runId })}
      onResumeDraft={nav.handleResumeDraft}
      onDiscardDraft={h.handleDiscardDraft}
      aiIcon={<HoustonLogo size={14} />}
      allowEventWake={triggers.triggersEnabled}
      renderTriggerEditor={triggers.renderTriggerEditor}
      triggerStatuses={triggers.triggerStatuses}
      triggerSummaries={triggers.triggerSummaries}
      onReconnectTrigger={triggers.onReconnectTrigger}
      labels={labels.grid}
      rowLabels={labels.rowLabels}
      scheduleSummaryLabels={labels.schedule.summary}
      scheduleLabels={labels.schedule}
      triggerLabels={labels.trigger}
      nextFireLabels={labels.nextFire}
      locale={labels.locale}
    />
  );
}
