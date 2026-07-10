/**
 * RoutineRowEdit — the routine editor panel: name, instruction, and how the
 * routine wakes (a schedule, or — where the deployment supports it — an event
 * trigger), plus Save/Cancel. Extracted from the row so it serves two callers:
 * a row's inline "Edit manually" panel and the grid's LOCAL new-routine draft
 * (nothing is written until Save succeeds).
 *
 * The panel does NOT own its open/closed state — the parent mounts/unmounts it.
 * It owns the field values, mirrored against a `baseline` of the last adopted
 * `initial`: while the user has no local edits the fields track external changes
 * to `initial` (an agent editing routines.json); local edits win until Save or
 * Cancel. It holds BOTH the schedule and the trigger simultaneously, so toggling
 * the wake mechanism never loses the other side's work until the user saves.
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
import type {
  RenderTriggerEditor,
  RoutineEditPatch,
  RoutineTriggerBinding,
  RoutineWake,
  RoutineWakeMode,
  TriggerStatusItem,
} from "./types";
import { WakeMechanismField } from "./wake-mechanism-field";

const DEFAULT_SCHEDULE = "0 9 * * *";

export interface RoutineRowEditProps {
  /** Source values. If they change externally (agent edited routines.json)
   *  while the user has NO local edits, the fields adopt the new values;
   *  local edits win until saved or cancelled. */
  initial: {
    name: string;
    prompt: string;
    schedule?: string;
    trigger?: RoutineTriggerBinding | null;
  };
  /** Resolves true on success; false keeps the panel open (caller toasts). */
  onSave: (patch: RoutineEditPatch) => Promise<boolean>;
  onCancel: () => void;
  /** New-routine mode: Save enabled only when name AND prompt are non-empty. */
  requireContent?: boolean;
  /** Override the Save button text (e.g. "Create routine"). */
  saveLabel?: string;
  autoFocusName?: boolean;
  /** Whether the deployment supports event triggers (shows the wake choice). */
  triggersEnabled?: boolean;
  /** App-wired trigger editor (picker + config form); absent hides the event side. */
  renderTriggerEditor?: RenderTriggerEditor;
  /** Live status of an already-provisioned event routine (editor badge). */
  triggerStatus?: TriggerStatusItem;
  onReconnectTrigger?: () => void;
  labels?: RoutineRowLabels;
  scheduleLabels?: ScheduleLabels;
  triggerLabels?: TriggerLabels;
  locale?: string;
}

interface Snapshot {
  name: string;
  prompt: string;
  mode: RoutineWakeMode;
  schedule: string;
  triggerJson: string;
}

function snapshotOf(v: RoutineRowEditProps["initial"]): Snapshot {
  return {
    name: v.name,
    prompt: v.prompt,
    mode: v.trigger ? "event" : "schedule",
    schedule: v.schedule ?? DEFAULT_SCHEDULE,
    triggerJson: v.trigger ? JSON.stringify(v.trigger) : "",
  };
}

export function RoutineRowEdit({
  initial,
  onSave,
  onCancel,
  requireContent = false,
  saveLabel,
  autoFocusName = false,
  triggersEnabled = false,
  renderTriggerEditor,
  triggerStatus,
  onReconnectTrigger,
  labels = DEFAULT_ROW_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  triggerLabels = DEFAULT_TRIGGER_LABELS,
  locale = "en-US",
}: RoutineRowEditProps) {
  const seed = snapshotOf(initial);
  const [name, setName] = useState(seed.name);
  const [prompt, setPrompt] = useState(seed.prompt);
  const [mode, setMode] = useState<RoutineWakeMode>(seed.mode);
  const [schedule, setSchedule] = useState(seed.schedule);
  const [trigger, setTrigger] = useState<RoutineTriggerBinding | null>(
    initial.trigger ?? null,
  );
  // An existing binding is assumed valid; a fresh event routine starts invalid.
  const [triggerValid, setTriggerValid] = useState(!!initial.trigger);
  const [baseline, setBaseline] = useState<Snapshot>(seed);
  const [saving, setSaving] = useState(false);

  const current: Snapshot = {
    name,
    prompt,
    mode,
    schedule,
    triggerJson: trigger ? JSON.stringify(trigger) : "",
  };
  const isDirty =
    current.name !== baseline.name ||
    current.prompt !== baseline.prompt ||
    current.mode !== baseline.mode ||
    current.schedule !== baseline.schedule ||
    current.triggerJson !== baseline.triggerJson;

  // Adopt external edits to `initial` when the user hasn't touched the fields
  // (render-phase adjust, same shape as routines-tab's trackedAgentId).
  const incoming = snapshotOf(initial);
  if (
    !isDirty &&
    (incoming.name !== baseline.name ||
      incoming.prompt !== baseline.prompt ||
      incoming.mode !== baseline.mode ||
      incoming.schedule !== baseline.schedule ||
      incoming.triggerJson !== baseline.triggerJson)
  ) {
    setBaseline(incoming);
    setName(incoming.name);
    setPrompt(incoming.prompt);
    setMode(incoming.mode);
    setSchedule(incoming.schedule);
    setTrigger(initial.trigger ?? null);
    setTriggerValid(!!initial.trigger);
  }

  const wakeReady =
    mode === "event" ? !!trigger && triggerValid : schedule.trim().length > 0;
  const contentReady = !requireContent || (!!name.trim() && !!prompt.trim());
  const saveDisabled =
    saving || !wakeReady || !contentReady || (!requireContent && !isDirty);

  const handleSave = async () => {
    const wake: RoutineWake =
      mode === "event" && trigger
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

      <WakeMechanismField
        triggersEnabled={triggersEnabled}
        mode={mode}
        onModeChange={setMode}
        schedule={schedule}
        onScheduleChange={setSchedule}
        triggerSlot={renderTriggerEditor?.({
          value: trigger,
          onChange: (binding, valid) => {
            setTrigger(binding);
            setTriggerValid(valid);
          },
        })}
        status={triggerStatus}
        onReconnect={onReconnectTrigger}
        scheduleLabels={scheduleLabels}
        triggerLabels={triggerLabels}
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
