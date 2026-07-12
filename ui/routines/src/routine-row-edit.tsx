/**
 * RoutineRowEdit — the routine editor panel: name, instruction, and how the
 * routine wakes, plus Save/Cancel. Extracted from the row so it serves two
 * callers: a row's inline "Edit manually" panel and the grid's LOCAL new-routine
 * draft (nothing is written until Save succeeds).
 *
 * A single editor authors exactly ONE wake mechanism, fixed by `variant`: the
 * Routines surface edits a cron `schedule` (the built-in ScheduleBuilder), the
 * Reactions surface edits an event `trigger` (the app-injected trigger editor).
 * There is no in-editor toggle between them — the surface decides.
 *
 * The panel does NOT own its open/closed state — the parent mounts/unmounts it.
 * It owns the field values, mirrored against a `baseline` of the last adopted
 * `initial`: while the user has no local edits the fields track external changes
 * to `initial` (an agent editing routines.json); local edits win until Save or
 * Cancel.
 */
import { Button, cn } from "@houston-ai/core";
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
  /** Which wake mechanism this editor authors: a cron schedule (default) or an
   *  event trigger. The Reactions surface passes "event". */
  variant?: RoutineWakeMode;
  /** App-wired trigger editor (picker + config form); required for "event". */
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
  variant = "schedule",
  renderTriggerEditor,
  triggerStatus,
  onReconnectTrigger,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  locale = "en-US",
}: RoutineRowEditProps) {
  const isEvent = variant === "event";
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
  const [saving, setSaving] = useState(false);

  const wakeReady = isEvent
    ? !!trigger && triggerValid
    : schedule.trim().length > 0;
  const contentReady = !requireContent || (!!name.trim() && !!prompt.trim());
  const saveDisabled =
    saving || !wakeReady || !contentReady || (!requireContent && !isDirty);

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
