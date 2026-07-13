/**
 * RoutinesGridList — the populated Routines view: description + "New routine"
 * CTA, the account-wide timezone bar, and the list card (a local new-routine
 * editor, then draft chats, then real routine rows). Split from RoutinesGrid,
 * which keeps the loading/empty gating and delegates here, so each file stays
 * under the size cap. Takes the grid's own props plus the pre-sorted routines.
 */
import { cn } from "@houston-ai/core";
import {
  DEFAULT_GRID_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_SCHEDULE_SUMMARY_LABELS,
  DEFAULT_TRIGGER_LABELS,
} from "./labels";
import { NewRoutineMenu } from "./new-routine-menu";
import { RoutineDraftRow } from "./routine-draft-row";
import { RoutineRow } from "./routine-row";
import { RoutineRowEdit } from "./routine-row-edit";
import type { RoutinesGridProps } from "./routines-grid";
import { TimezonePicker } from "./timezone-picker";
import type { Routine } from "./types";

export function RoutinesGridList({
  sorted,
  lastRuns = {},
  draftActivities = [],
  newDraft,
  accountTimezone,
  onTimezoneChange,
  onCreateWithAi,
  onCreateManually,
  onToggle,
  onSaveRoutine,
  onEditWithAi,
  onDeleteRoutine,
  onRunNow,
  onStopRun,
  onResumeDraft,
  onDiscardDraft,
  aiIcon,
  labels = DEFAULT_GRID_LABELS,
  rowLabels = DEFAULT_ROW_LABELS,
  scheduleSummaryLabels = DEFAULT_SCHEDULE_SUMMARY_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  allowEventWake = false,
  renderTriggerEditor,
  triggerStatuses = {},
  triggerSummaries = {},
  onReconnectTrigger,
  locale = "en-US",
}: RoutinesGridProps & { sorted: Routine[] }) {
  const l = labels;
  const hasCreate = onCreateWithAi || onCreateManually;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
      <div className="max-w-3xl mx-auto px-6 py-7">
        {/* Description + CTA. No page title — tab handles it. */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <p className="text-xs text-ink-muted max-w-md">
            {l.descriptionShort}
          </p>
          {hasCreate && (
            <NewRoutineMenu
              onCreateWithAi={onCreateWithAi ?? (() => {})}
              onCreateManually={onCreateManually ?? (() => {})}
              labels={labels}
              aiIcon={aiIcon}
              size="sm"
            />
          )}
        </div>

        {/* Account-wide timezone — governs every routine in the list below. */}
        {onTimezoneChange && (
          <TimezonePicker
            accountTimezone={accountTimezone}
            onTimezoneChange={onTimezoneChange}
            label={l.timezoneLabel}
            hint={l.timezoneHint}
            searchPlaceholder={l.timezoneSearchPlaceholder}
            noResults={l.timezoneNoResults}
            className="mb-3"
          />
        )}

        {/* List card — gray, divides hold rows. A local new-routine editor
            leads, then draft chats, then real routines. */}
        <div
          className={cn(
            "rounded-xl bg-chip overflow-hidden",
            "divide-y divide-line/60",
          )}
        >
          {newDraft && (
            <div className="px-5 py-4">
              <RoutineRowEdit
                initial={{ name: "", prompt: "", schedule: "0 9 * * *" }}
                requireContent
                saveLabel={l.createRoutine}
                autoFocusName
                allowEventWake={allowEventWake}
                onSave={newDraft.onSave}
                onCancel={newDraft.onCancel}
                renderTriggerEditor={renderTriggerEditor}
                labels={rowLabels}
                scheduleLabels={scheduleLabels}
                triggerLabels={triggerLabels}
                locale={locale}
              />
            </div>
          )}
          {draftActivities.map((draft) => (
            <RoutineDraftRow
              key={draft.id}
              onResume={() => onResumeDraft?.(draft.id)}
              onDiscard={() => onDiscardDraft?.(draft.id)}
              labels={labels}
            />
          ))}
          {sorted.map((routine) => {
            const lastRun = lastRuns[routine.id];
            return (
              <RoutineRow
                key={routine.id}
                routine={routine}
                lastRun={lastRun}
                accountTimezone={accountTimezone}
                aiIcon={aiIcon}
                onToggle={
                  onToggle
                    ? (enabled) => onToggle(routine.id, enabled)
                    : undefined
                }
                onSave={
                  onSaveRoutine
                    ? (patch) => onSaveRoutine(routine.id, patch)
                    : undefined
                }
                onEditWithAi={
                  onEditWithAi ? () => onEditWithAi(routine.id) : undefined
                }
                onDelete={
                  onDeleteRoutine
                    ? () => onDeleteRoutine(routine.id)
                    : undefined
                }
                onRunNow={onRunNow ? () => onRunNow(routine.id) : undefined}
                onStopRun={
                  onStopRun && lastRun
                    ? () => onStopRun(routine.id, lastRun.id)
                    : undefined
                }
                allowEventWake={allowEventWake}
                renderTriggerEditor={renderTriggerEditor}
                triggerStatus={triggerStatuses[routine.id]}
                triggerSummary={triggerSummaries[routine.id]}
                onReconnectTrigger={
                  onReconnectTrigger
                    ? () => onReconnectTrigger(routine.id)
                    : undefined
                }
                labels={rowLabels}
                scheduleSummaryLabels={scheduleSummaryLabels}
                nextFireLabels={nextFireLabels}
                scheduleLabels={scheduleLabels}
                triggerLabels={triggerLabels}
                locale={locale}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
