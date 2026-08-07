import { Badge, Button, cn } from "@houston-ai/core";
import { RoutinesGrid, TimezonePicker } from "@houston-ai/routines";
import { Plus } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineRuns, useRoutines } from "../../hooks/queries";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { analytics } from "../../lib/analytics";
import type { TabProps } from "../../lib/types";
import { useIsActiveView } from "../shell/keep-alive-views";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { useRoutineLeadingIcon } from "./routine-leading-icon";
import { latestRunByRoutine, selectionRoutineId } from "./routines-tab-model";
import { RoutinesTabPane } from "./routines-tab-pane";
import { useRoutineChatSetup } from "./use-routine-chat-setup";
import { useRoutineTabHandlers } from "./use-routine-tab-handlers";
import { useRoutineTriggers } from "./use-routine-triggers";
import { useRoutinesTabView } from "./use-routines-tab-view";

/**
 * The Routines tab: everything the agent does on its own, in ONE list —
 * routines that wake on a cron schedule or on an event in a connected app (C9).
 * It reads like an email client: a persistent LIST on the left, and the
 * SELECTED routine's CHAT in the big shell-level panel on the right (each
 * routine IS a chat) — the EXACT panel the Activity board opens, via
 * `useShellDetailPanel`. Nothing selected -> the list centers as a single
 * column, no panel. "New routine" opens the create INTAKE in that same panel
 * over an empty chat surface (locally-driven question cards, zero model calls);
 * on completion the same panel continues seamlessly with the real agent. Rows
 * only open their chat, toggle, run, or delete — no manual editor. Mutations
 * live in `useRoutineTabHandlers`; selection lives in `useRoutinesTabView`.
 */
export default function RoutinesTab({
  agent,
  agentDef,
  isActive = false,
}: TabProps) {
  const { t } = useTranslation("routines");
  const labels = useRoutineLabels();
  const path = agent.folderPath;

  const { data: routines, isLoading } = useRoutines(path);
  const { data: allRuns, isLoading: runsLoading } = useRoutineRuns(path);
  const lastRuns = latestRunByRoutine(allRuns);

  const chatSetup = useRoutineChatSetup(agent, routines);
  const nav = useRoutinesTabView(routines, chatSetup);
  const triggers = useRoutineTriggers(agent, routines);
  const h = useRoutineTabHandlers(agent);

  // The chat opens in the SAME shell-level panel the Activity board uses (a
  // sibling of the main card, not a pane nested in this tab). A selection owns
  // that panel while Automations is visible; the pre-model intake/draft
  // surfaces have no board to drive it themselves.
  const { selected } = nav;
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  // The chat portals into the ONE shared shell panel that every tab reuses. Only
  // the visible tab of the visible screen may portal into it — otherwise this
  // (hidden) tab stacks its routine chat on top of the Activity tab's open
  // mission panel, splitting the chat in half (HOU-1165). Gate the portal target
  // on screen + tab visibility; a null container renders the (already hidden)
  // board's inline fallback instead, which paints nothing.
  const screenActive = useIsActiveView();
  const portalContainer = isActive && screenActive ? panelContainer : null;
  // The claim tracks exactly what this tab renders: a selection while it is the
  // visible tab, nothing otherwise. Releasing on the way out is safe because the
  // claim is this tab's own — it can't clobber a mission navigation that just
  // opened the Activity board's panel (PRODUCT-1229). `useShellDetailPanel`
  // releases it again on unmount.
  useEffect(() => {
    setPanelOpen(isActive && !!selected);
  }, [isActive, selected, setPanelOpen]);
  // Per-row identity glyph — the triggering app's logo (or a webhook mark) for
  // event routines, the grid's default clock for schedule ones.
  const leadingIcon = useRoutineLeadingIcon(triggers.triggersEnabled);

  // Schedule rows render against the real account zone, so the list waits for
  // the timezone roundtrip once per open.
  if (!h.tz.loaded || !h.tz.timezone) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ink-muted animate-pulse">{t("loading")}</p>
      </div>
    );
  }

  const count = routines?.length ?? 0;
  // Genuinely nothing to show (no routines, no draft chats): the list renders
  // ONLY its empty state — the header row and the timezone footer both drop, so
  // the empty state stands alone with its own create button.
  const listEmpty = count === 0 && chatSetup.draftActivities.length === 0;

  // The one primary create action, reused by the header (populated list) and
  // the empty state's own slot (empty list) so the copy never diverges.
  const createButton = (
    <Button onClick={nav.openIntake}>
      <Plus className="size-4" />
      {t("chat.newRoutineTitle")}
    </Button>
  );

  return (
    <div className="flex h-full min-h-0">
      {/* LEFT: the persistent list — compact header (title, count, create),
          rows, and a quiet timezone footer. With the chat panel closed the
          whole list centers in a readable max-width column; with it open the
          list fills its (now narrower) share of the main card naturally. */}
      <div
        className={cn(
          "flex min-w-0 flex-col",
          selected ? "flex-1" : "mx-auto w-full max-w-3xl",
        )}
      >
        {!listEmpty && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-3">
            <h2 className="text-sm font-medium text-ink">{t("listTitle")}</h2>
            {count > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {count}
              </Badge>
            )}
            <div className="ml-auto">{createButton}</div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <RoutinesGrid
            routines={routines ?? []}
            lastRuns={lastRuns}
            draftActivities={chatSetup.draftActivities}
            accountTimezone={h.tz.timezone ?? "UTC"}
            loading={isLoading}
            selectedRoutineId={selectionRoutineId(selected)}
            selectedDraftId={
              selected?.kind === "draft" ? selected.activityId : null
            }
            onOpenChat={nav.handleOpenRoutine}
            // Plain .mutate: a rejected toggle/delete/stop would be an unhandled
            // rejection, and call() already toasts each failure.
            onToggle={(id, enabled) =>
              h.updateRoutine.mutate({ routineId: id, updates: { enabled } })
            }
            onDeleteRoutine={(routineId) => h.deleteRoutine.mutate(routineId)}
            // Manual runs are the intentional analytics signal for usage.
            onRunNow={(routineId) => {
              analytics.track("routine_executed", { routine_id: routineId });
              h.runNow.mutate(routineId);
            }}
            onStopRun={(routineId, runId) =>
              h.cancelRun.mutate({ routineId, runId })
            }
            onResumeDraft={nav.handleResumeDraft}
            onDiscardDraft={h.handleDiscardDraft}
            leadingIcon={leadingIcon}
            // Inline schedule edit from the row: persist the new cron straight
            // through the routine update mutation (`schedule` clears any trigger
            // binding server-side). No optimistic push — the routines query
            // repaints on the write's event, and call() toasts any failure.
            onScheduleChange={(routineId, cron) =>
              h.updateRoutine.mutate({ routineId, updates: { schedule: cron } })
            }
            triggerStatuses={triggers.triggerStatuses}
            triggerSummaries={triggers.triggerSummaries}
            onReconnectTrigger={triggers.onReconnectTrigger}
            labels={labels.grid}
            rowLabels={labels.rowLabels}
            scheduleLabels={labels.schedule}
            scheduleSummaryLabels={labels.schedule.summary}
            triggerLabels={labels.trigger}
            nextFireLabels={labels.nextFire}
            locale={labels.locale}
            emptyAction={createButton}
          />
        </div>

        {!listEmpty && (
          <div className="shrink-0 border-t border-line/50 px-4 py-2">
            <TimezonePicker
              variant="bare"
              accountTimezone={h.tz.timezone ?? "UTC"}
              onTimezoneChange={h.handleTimezoneChange}
              label={labels.grid.timezoneLabel}
              hint={labels.grid.timezoneHint}
              searchPlaceholder={labels.grid.timezoneSearchPlaceholder}
              noResults={labels.grid.timezoneNoResults}
            />
          </div>
        )}
      </div>

      {/* RIGHT: the selected routine's chat (or the create intake), rendered
          into the big shell-level panel via `panelContainer` — the exact same
          panel the Activity board opens. This subtree portals its content out,
          so it adds no layout of its own here. */}
      {selected && (
        <RoutinesTabPane
          selected={selected}
          agent={agent}
          agentDef={agentDef}
          routines={routines}
          chatSetup={chatSetup}
          allRuns={allRuns}
          runsLoading={runsLoading}
          triggerSummaries={triggers.triggerSummaries}
          accountTimezone={h.tz.timezone ?? "UTC"}
          triggersAvailable={triggers.triggersEnabled}
          panelContainer={portalContainer}
          onIntakeComplete={nav.handleIntakeComplete}
          onIntakeDismiss={nav.dismissIntake}
          onIntakeSend={nav.handleIntakeComposerSend}
          onDeselect={nav.deselect}
          onOpenChat={nav.openRoutineChat}
          onOpenRun={nav.openRun}
          onBackToRoutine={nav.backToRoutine}
        />
      )}
    </div>
  );
}
