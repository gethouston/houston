/**
 * RoutineRowEdit — the routine editor panel: the three fields a person actually
 * hand-sets (name, instruction, schedule) plus Save/Cancel. Extracted from the
 * row so it serves two callers: a row's inline "Edit manually" panel and the
 * grid's LOCAL new-routine draft (nothing is written until Save succeeds).
 *
 * The panel does NOT own its open/closed state — the parent mounts/unmounts it.
 * It owns only the field values, mirrored against a `baseline` of the last
 * adopted `initial`: while the user has no local edits the fields track external
 * changes to `initial` (an agent editing routines.json), but local edits win
 * until Save or Cancel, so a background write never clobbers what's being typed.
 */
import { Button, cn } from "@houston-ai/core";
import { useState } from "react";
import {
  DEFAULT_ROW_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  type RoutineRowLabels,
  type ScheduleLabels,
} from "./labels";
import { ScheduleBuilder } from "./schedule-builder";

export interface RoutineRowEditProps {
  /** Source values. If they change externally (agent edited routines.json)
   *  while the user has NO local edits, the fields adopt the new values;
   *  local edits win until saved or cancelled. */
  initial: { name: string; prompt: string; schedule: string };
  /** Resolves true on success; false keeps the panel open (caller toasts). */
  onSave: (patch: {
    name: string;
    schedule: string;
    prompt: string;
  }) => Promise<boolean>;
  onCancel: () => void;
  /** New-routine mode: Save enabled only when name AND prompt are non-empty. */
  requireContent?: boolean;
  /** Override the Save button text (e.g. "Create routine"). */
  saveLabel?: string;
  autoFocusName?: boolean;
  labels?: RoutineRowLabels;
  scheduleLabels?: ScheduleLabels;
  locale?: string;
}

export function RoutineRowEdit({
  initial,
  onSave,
  onCancel,
  requireContent = false,
  saveLabel,
  autoFocusName = false,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
}: RoutineRowEditProps) {
  const [name, setName] = useState(initial.name);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [schedule, setSchedule] = useState(initial.schedule);
  const [baseline, setBaseline] = useState(initial);
  const [saving, setSaving] = useState(false);

  const isDirty =
    name !== baseline.name ||
    prompt !== baseline.prompt ||
    schedule !== baseline.schedule;

  // Adopt external edits to `initial` when the user hasn't touched the fields
  // (render-phase adjust, same shape as routines-tab's trackedAgentId). Dirty
  // means the user is mid-edit, so their values stay until save/cancel.
  if (
    !isDirty &&
    (initial.name !== baseline.name ||
      initial.prompt !== baseline.prompt ||
      initial.schedule !== baseline.schedule)
  ) {
    setBaseline(initial);
    setName(initial.name);
    setPrompt(initial.prompt);
    setSchedule(initial.schedule);
  }

  const saveDisabled = saving
    ? true
    : requireContent
      ? !name.trim() || !prompt.trim()
      : !isDirty;

  const handleSave = async () => {
    setSaving(true);
    const ok = await onSave({
      name: name.trim(),
      schedule,
      prompt: prompt.trim(),
    });
    // On success the parent unmounts this panel; only re-enable on failure.
    if (!ok) setSaving(false);
  };

  const fieldClass = cn(
    "w-full px-3 py-2 text-sm text-foreground",
    "bg-background border border-foreground/[0.08] rounded-lg",
    "outline-none transition-shadow duration-200",
    "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
  );

  return (
    <div className="px-5 pb-4 space-y-3">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
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
        <p className="text-xs font-medium text-muted-foreground mb-1.5">
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

      <ScheduleBuilder
        value={schedule}
        onChange={setSchedule}
        labels={scheduleLabels}
        locale={locale}
      />

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
