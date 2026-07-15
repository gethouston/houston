/**
 * RoutineRowEdit — the routine editor panel: name, instruction, and how the
 * routine wakes, plus Save/Cancel. Extracted from the row so it serves two
 * callers: a row's inline "Edit manually" panel and the grid's LOCAL new-routine
 * draft (nothing is written until Save succeeds).
 *
 * A routine wakes in exactly ONE of two ways — a cron `schedule` or an event
 * `trigger` (C9) — and the editor owns that choice: where the deployment
 * supports event triggers (`allowEventWake` + an injected trigger editor), a
 * plain-language "When should this happen?" toggle switches between the
 * built-in ScheduleBuilder and the app-injected trigger editor. Where it
 * doesn't, the toggle is absent and the editor authors a schedule, exactly as
 * before — one product, capability-shaped.
 *
 * The panel does NOT own its open/closed state — the parent mounts/unmounts it.
 * It owns the field values, mirrored against a `baseline` of the last adopted
 * `initial`: while the user has no local edits the fields track external changes
 * to `initial` (an agent editing routines.json); local edits win until Save or
 * Cancel.
 */
import { Button, cn } from "@houston-ai/core";
import { Clock, Zap } from "lucide-react";
import { useState } from "react";
import {
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_TRIGGER_LABELS,
  type RoutineRowLabels,
  type ScheduleLabels,
  type TriggerLabels,
} from "./labels";
import { ScheduleBuilder } from "./schedule-builder";
import { TriggerStatusBadge } from "./trigger-status-badge";
import type {
  RenderTriggerEditor,
  RoutineEditPatch,
  RoutineWake,
  RoutineWakeMode,
  TriggerStatusItem,
} from "./types";
import {
  type RoutineEditInitial,
  useRoutineEditFields,
} from "./use-routine-edit-fields";

export interface RoutineRowEditProps {
  /** Source values. If they change externally (agent edited routines.json)
   *  while the user has NO local edits, the fields adopt the new values;
   *  local edits win until saved or cancelled. */
  initial: RoutineEditInitial;
  /** Resolves true on success; false keeps the panel open (caller toasts). */
  onSave: (patch: RoutineEditPatch) => Promise<boolean>;
  onCancel: () => void;
  /** New-routine mode: Save enabled only when name AND prompt are non-empty. */
  requireContent?: boolean;
  /** Override the Save button text (e.g. "Create routine"). */
  saveLabel?: string;
  autoFocusName?: boolean;
  /** Whether the "when something happens in an app" wake is offered — true only
   *  where the deployment supports event triggers (`capabilities.triggers`).
   *  Off, the editor is schedule-only and shows no choice. */
  allowEventWake?: boolean;
  /** App-wired trigger editor (picker + config form); required for the event
   *  wake to be editable. */
  renderTriggerEditor?: RenderTriggerEditor;
  /** Live status of an already-provisioned event routine (editor badge). */
  triggerStatus?: TriggerStatusItem;
  onReconnectTrigger?: () => void;
  labels?: RoutineRowLabels;
  scheduleLabels?: ScheduleLabels;
  triggerLabels?: TriggerLabels;
  locale?: string;
}

export function RoutineRowEdit({
  initial,
  onSave,
  onCancel,
  requireContent = false,
  saveLabel,
  autoFocusName = false,
  allowEventWake = false,
  renderTriggerEditor,
  triggerStatus,
  onReconnectTrigger,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  locale = "en-US",
}: RoutineRowEditProps) {
  const {
    name,
    setName,
    prompt,
    setPrompt,
    schedule,
    setSchedule,
    trigger,
    setTrigger,
    triggerValid,
    setTriggerValid,
    isDirty,
  } = useRoutineEditFields(initial);
  // An existing event routine opens on its event; everything else on schedule.
  const initialMode: RoutineWakeMode = initial.trigger ? "event" : "schedule";
  const [mode, setMode] = useState<RoutineWakeMode>(initialMode);
  // Adopt an external wake change (agent rewrote the routine) while the user
  // hasn't flipped the choice themselves — same render-phase adjust as the
  // field baseline in useRoutineEditFields.
  const [modeBaseline, setModeBaseline] =
    useState<RoutineWakeMode>(initialMode);
  if (initialMode !== modeBaseline) {
    setModeBaseline(initialMode);
    if (mode === modeBaseline) setMode(initialMode);
  }
  const [saving, setSaving] = useState(false);

  const isEvent = mode === "event";
  // The choice needs both the capability AND the injected editor; an existing
  // event routine keeps its event side visible even if the editor is absent.
  const showWakeChoice = allowEventWake && !!renderTriggerEditor;

  const wakeReady = isEvent
    ? !!trigger && triggerValid
    : schedule.trim().length > 0;
  const contentReady = !requireContent || (!!name.trim() && !!prompt.trim());
  // Switching wake mode is itself an edit (e.g. event → schedule keeps the
  // default cron but must still be savable), so it counts toward dirtiness.
  const modeChanged = initialMode !== mode;
  const saveDisabled =
    saving ||
    !wakeReady ||
    !contentReady ||
    (!requireContent && !isDirty && !modeChanged);

  const handleSave = async () => {
    const wake: RoutineWake =
      isEvent && trigger
        ? { mode: "event", trigger }
        : { mode: "schedule", schedule };
    setSaving(true);
    const ok = await onSave({
      name: name.trim(),
      prompt: prompt.trim(),
      wake,
    });
    // On success the parent unmounts this panel; only re-enable on failure.
    if (!ok) setSaving(false);
  };

  const fieldClass = cn(
    "w-full px-3 py-2 text-sm text-ink",
    "bg-input border border-ink/[0.08] rounded-lg",
    "outline-none transition-shadow duration-200",
    "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
  );

  // Option cards for the wake choice: icon + label + one-line example. The
  // selected card reads by border weight AND the filled icon chip (never color
  // alone); aria-pressed carries it for AT.
  const wakeCard = (active: boolean) =>
    cn(
      "flex-1 flex items-start gap-2.5 rounded-lg border p-3 text-left",
      "transition-colors duration-150",
      active
        ? "border-ink/60 bg-chip"
        : "border-ink/[0.08] bg-input hover:bg-hover",
    );
  const wakeIcon = (active: boolean) =>
    cn(
      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
      active ? "bg-action text-action-text" : "bg-chip text-ink-muted",
    );

  return (
    <div className="px-5 pb-4 space-y-3">
      <div>
        <p className="text-xs font-medium text-ink-muted mb-1.5">
          {labels.nameLabel}
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.namePlaceholder}
          className={fieldClass}
          // biome-ignore lint/a11y/noAutofocus: opening the editor is a deliberate action (menu click / New routine) and the name field is the obvious next thing to type.
          autoFocus={autoFocusName}
        />
      </div>

      <div>
        <p className="text-xs font-medium text-ink-muted mb-1.5">
          {labels.instructionLabel}
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={labels.instructionPlaceholder}
          rows={3}
          className={cn(fieldClass, "leading-relaxed resize-none")}
        />
      </div>

      {showWakeChoice && (
        <div>
          <p className="text-xs font-medium text-ink-muted mb-1.5">
            {labels.whenTitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              aria-pressed={!isEvent}
              className={wakeCard(!isEvent)}
              onClick={() => setMode("schedule")}
            >
              <span className={wakeIcon(!isEvent)}>
                <Clock className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {labels.whenSchedule}
                </span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  {labels.whenScheduleHint}
                </span>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={isEvent}
              className={wakeCard(isEvent)}
              onClick={() => setMode("event")}
            >
              <span className={wakeIcon(isEvent)}>
                <Zap className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {labels.whenEvent}
                </span>
                <span className="block text-xs text-ink-muted mt-0.5">
                  {labels.whenEventHint}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}

      {isEvent ? (
        <div className="space-y-3">
          {triggerStatus && (
            <TriggerStatusBadge
              status={triggerStatus}
              onReconnect={onReconnectTrigger}
              withDetail
              labels={triggerLabels}
            />
          )}
          {renderTriggerEditor?.({
            value: trigger,
            onChange: (binding, valid) => {
              setTrigger(binding);
              setTriggerValid(valid);
            },
          })}
        </div>
      ) : (
        <ScheduleBuilder
          value={schedule}
          onChange={setSchedule}
          labels={scheduleLabels}
          locale={locale}
        />
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          {labels.cancel}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saveDisabled}>
          {saveLabel ?? labels.save}
        </Button>
      </div>
    </div>
  );
}
