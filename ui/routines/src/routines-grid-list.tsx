/**
 * RoutinesGridList — the populated Automations view, on the shared catalog
 * grammar (the same flat plane as the Integrations page and AI models hub):
 * description + "New automation" CTA, the account-wide timezone bar, a local
 * new-automation editor panel, draft-chat rows, then the routines as flat
 * hover-fill rows split into Active / Paused sections with count chips
 * (`CatalogSectionHeader`). No slab card, no hairline dividers — a row's
 * hover wash is its boundary, exactly like every other catalog surface.
 * Split from RoutinesGrid, which keeps the loading/empty gating and delegates
 * here, so each file stays under the size cap.
 */
import { CatalogSectionHeader, cn } from "@houston-ai/core";
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

  const active = sorted.filter((r) => r.enabled);
  const paused = sorted.filter((r) => !r.enabled);
  // A lone "Active" header over everything is noise; the split earns its
  // headers only once both groups exist.
  const showSections = paused.length > 0;

  const row = (routine: Routine) => {
    const lastRun = lastRuns[routine.id];
    return (
      <RoutineRow
        key={routine.id}
        routine={routine}
        lastRun={lastRun}
        accountTimezone={accountTimezone}
        aiIcon={aiIcon}
        onToggle={
          onToggle ? (enabled) => onToggle(routine.id, enabled) : undefined
        }
        onSave={
          onSaveRoutine
            ? (patch) => onSaveRoutine(routine.id, patch)
            : undefined
        }
        onEditWithAi={onEditWithAi ? () => onEditWithAi(routine.id) : undefined}
        onDelete={
          onDeleteRoutine ? () => onDeleteRoutine(routine.id) : undefined
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
          onReconnectTrigger ? () => onReconnectTrigger(routine.id) : undefined
        }
        labels={rowLabels}
        scheduleSummaryLabels={scheduleSummaryLabels}
        nextFireLabels={nextFireLabels}
        scheduleLabels={scheduleLabels}
        triggerLabels={triggerLabels}
        locale={locale}
      />
    );
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
      <div className="mx-auto w-full max-w-3xl px-6 py-6 space-y-5">
        {/* Description + CTA. No page title — tab handles it. */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-ink-muted max-w-md">
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

        {/* Account-wide timezone — governs every scheduled automation below. */}
        {onTimezoneChange && (
          <TimezonePicker
            accountTimezone={accountTimezone}
            onTimezoneChange={onTimezoneChange}
            label={l.timezoneLabel}
            hint={l.timezoneHint}
            searchPlaceholder={l.timezoneSearchPlaceholder}
            noResults={l.timezoneNoResults}
          />
        )}

        {/* A local, uncommitted new-automation editor: its own bounded panel
            (it is a form, not a row), nothing written until Save succeeds. */}
        {newDraft && (
          <div
            className={cn("rounded-xl border border-ink/[0.08] bg-input pt-4")}
          >
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

        {(draftActivities.length > 0 || sorted.length > 0) && (
          <div className="space-y-5">
            {(draftActivities.length > 0 || active.length > 0) && (
              <section>
                {showSections && (
                  <CatalogSectionHeader
                    title={l.sectionActive}
                    count={active.length}
                    className="mb-2"
                  />
                )}
                <div className="space-y-0.5">
                  {draftActivities.map((draft) => (
                    <RoutineDraftRow
                      key={draft.id}
                      onResume={() => onResumeDraft?.(draft.id)}
                      onDiscard={() => onDiscardDraft?.(draft.id)}
                      labels={labels}
                    />
                  ))}
                  {active.map(row)}
                </div>
              </section>
            )}
            {paused.length > 0 && (
              <section>
                <CatalogSectionHeader
                  title={l.sectionPaused}
                  count={paused.length}
                  className="mb-2"
                />
                <div className="space-y-0.5">{paused.map(row)}</div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
