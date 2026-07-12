import { RoutinesGrid } from "@houston-ai/routines";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineRuns, useRoutines } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { analytics } from "../../lib/analytics";
import type { SetupChatKind } from "../../lib/routine-chat-setup";
import type { TabProps } from "../../lib/types";
import { HoustonLogo } from "../shell/agent-avatar";
import { RoutineSetupChat } from "./routine-setup-chat";
import {
  latestRunByRoutine,
  reactionRoutines,
  scheduleRoutines,
} from "./routines-tab-model";
import { useRoutineChatSetup } from "./use-routine-chat-setup";
import { useRoutineTabHandlers } from "./use-routine-tab-handlers";
import { useRoutineTriggers } from "./use-routine-triggers";
import { useRoutinesTabView } from "./use-routines-tab-view";

/**
 * The shared list surface behind both the Routines tab (schedule-driven, `kind`
 * "routine") and the Reactions tab (event-driven, `kind` "reaction"). One file,
 * one routines list on disk; `kind` filters the list, picks the labels, chooses
 * the wake mechanism the "Manually" editor authors, and turns the timezone bar
 * and event-trigger surface on or off. Mutations live in `useRoutineTabHandlers`.
 */
export function RoutineListTab({
  agent,
  agentDef,
  kind,
}: TabProps & { kind: SetupChatKind }) {
  const { t } = useTranslation("routines");
  const isReaction = kind === "reaction";
  const labels = useRoutineLabels(kind);
  const path = agent.folderPath;

  const { data: allRoutines, isLoading } = useRoutines(path);
  const routines = useMemo(
    () =>
      isReaction
        ? reactionRoutines(allRoutines)
        : scheduleRoutines(allRoutines),
    [allRoutines, isReaction],
  );
  const { data: allRuns } = useRoutineRuns(path);
  const lastRuns = latestRunByRoutine(allRuns);

  const chatSetup = useRoutineChatSetup(agent, routines, kind);
  const nav = useRoutinesTabView(agent, routines, chatSetup);
  const triggers = useRoutineTriggers(
    agent,
    routines,
    labels.trigger,
    isReaction,
  );
  const h = useRoutineTabHandlers(agent, nav.closeNewDraft);

  // Schedule rows render against the real account zone, so the Routines tab
  // waits for the timezone roundtrip; Reactions have no cron and never block.
  if (!isReaction && (!h.tz.loaded || !h.tz.timezone)) {
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
        newLabel={isReaction ? t("reactions.chat.newTitle") : undefined}
        itemLabel={
          isReaction
            ? t("reactions.chat.itemLabel", { name: routine?.name ?? "" })
            : undefined
        }
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
      // The Reactions tab has no cron, so it omits the account-wide timezone bar.
      onTimezoneChange={isReaction ? undefined : h.handleTimezoneChange}
      newDraftVariant={isReaction ? "event" : "schedule"}
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
