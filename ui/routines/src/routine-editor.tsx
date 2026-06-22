/**
 * RoutineEditor — single screen for both creating and editing a routine.
 *
 * Layout: white canvas (matches app shell), single header bar at the top,
 * scrolling body composed of typographic sections separated by hairlines.
 * The composer hero is the only "boxed" element — it's the substance of the
 * routine — everything else is plain settings rows.
 */
import { useMemo } from "react";
import {
  cn,
  Button,
  Switch,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Trash2,
  CalendarClock,
  MoreHorizontal,
} from "lucide-react";
import type { Routine, RoutineChatMode, RoutineRun } from "./types";
import { ScheduleBuilder } from "./schedule-builder";
import { RunHistory } from "./run-history";
import { nextFire, describeNextFire } from "./next-fire";
import { useNow } from "./use-now";
import {
  interp,
  DEFAULT_EDITOR_LABELS,
  DEFAULT_SCHEDULE_LABELS,
  DEFAULT_NEXT_FIRE_LABELS,
  DEFAULT_RUN_HISTORY_LABELS,
  type RoutineEditorLabels,
  type ScheduleLabels,
  type NextFireLabels,
  type RunHistoryLabels,
} from "./labels";

export interface RoutineFormData {
  name: string;
  description: string;
  prompt: string;
  schedule: string;
  suppress_when_silent: boolean;
  /** Whether each run reuses one chat (`"shared"`) or starts a fresh one. */
  chat_mode: RoutineChatMode;
  /** Composio toolkit slugs this routine uses. */
  integrations: string[];
  /** Provider id override. `null`/absent means inherit the agent's provider. */
  provider?: string | null;
  /** Model override. `null`/absent means inherit the agent's model. */
  model?: string | null;
  /** Reasoning-effort override. `null`/absent means inherit the agent's effort. */
  effort?: string | null;
}

export interface RoutineEditorProps {
  value: RoutineFormData;
  onChange: (patch: Partial<RoutineFormData>) => void;
  onBack: () => void;
  onSubmit: () => void;
  /** Falsy = "new" mode. Provide the existing routine to enter edit mode. */
  routine?: Routine;
  runs?: RoutineRun[];
  onRunNow?: () => void;
  /** Disable the "Run now" button while a manual-run request is in flight.
   *  Guards against spam-click races where the disk-state `running` row
   *  hasn't propagated through TanStack invalidation yet — without this,
   *  each extra click queues a redundant request that the engine then
   *  rejects with 409 (or, on older builds, recorded as a conflict-error
   *  row in run history). */
  runNowPending?: boolean;
  /** Stop an in-flight run. When present + a run is `running`, the header
   *  "Run now" button swaps to "Stop" and the matching run row shows a stop
   *  control. */
  onCancelRun?: (runId: string) => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  onViewActivity?: (activityId: string) => void;
  /**
   * The single account-wide IANA timezone every routine fires in. Drives the
   * "next run" preview. The zone itself is chosen on the routines list (see
   * `RoutinesGrid`), not here — every routine shares it.
   */
  accountTimezone: string;
  /** Disable Save when the form hasn't actually been touched. */
  hasChanges?: boolean;
  /**
   * App-supplied provider + model picker (e.g. the chat model selector),
   * rendered in the Behavior section. `ui/` stays provider-agnostic per the
   * library boundary, so the concrete picker — which knows the provider/model
   * catalog and connection state — is injected from `app/`. Omit it (standalone
   * callers) and the model row is hidden. The picker drives `value.provider` +
   * `value.model` through `onChange`.
   */
  modelPicker?: React.ReactNode;
  /**
   * Localized labels. English defaults so standalone callers still work; the
   * app passes `t()` results in per the library-boundary rule.
   */
  labels?: RoutineEditorLabels;
  scheduleLabels?: ScheduleLabels;
  nextFireLabels?: NextFireLabels;
  runHistoryLabels?: RunHistoryLabels;
  /** BCP-47 locale for day names + time formatting in schedules. */
  locale?: string;
}

// ----- Building blocks -----

/**
 * Gray card on the white page. Calm, low-contrast. Important sub-elements
 * (inputs, callouts) sit inside as white "wells" so the eye knows where to
 * land and where to type.
 */
function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-secondary px-5 py-5">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium text-muted-foreground mb-1.5 block">
      {children}
    </p>
  );
}

// ----- Main -----

export function RoutineEditor({
  value,
  onChange,
  onBack,
  onSubmit,
  routine,
  runs = [],
  onRunNow,
  runNowPending,
  onCancelRun,
  onToggle,
  onDelete,
  onViewActivity,
  accountTimezone,
  hasChanges,
  modelPicker,
  labels = DEFAULT_EDITOR_LABELS,
  scheduleLabels = DEFAULT_SCHEDULE_LABELS,
  nextFireLabels = DEFAULT_NEXT_FIRE_LABELS,
  runHistoryLabels = DEFAULT_RUN_HISTORY_LABELS,
  locale = "en-US",
}: RoutineEditorProps) {
  const runningRun = runs.find((r) => r.status === "running");
  const isEdit = !!routine;
  const canSubmit =
    !!value.name.trim() &&
    !!value.prompt.trim() &&
    !!value.schedule.trim() &&
    (!isEdit || hasChanges !== false);

  // Live "next run" preview, ticking every minute. Every routine fires in the
  // account-wide zone, so the preview is computed against `accountTimezone`.
  const now = useNow(60_000);
  const next = useMemo(
    () =>
      value.schedule ? nextFire(value.schedule, accountTimezone, now) : null,
    [value.schedule, accountTimezone, now],
  );
  const nextDescr = next
    ? describeNextFire(next, accountTimezone, now, nextFireLabels, locale)
    : null;

  // Header title — live, mirrors what the user is typing.
  const headerTitle = isEdit
    ? value.name.trim() || routine?.name || labels.untitled
    : labels.newRoutine;
  const hasOverflow = isEdit && (onToggle || onDelete);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Single action bar: back · context · primary on right */}
      <header className="px-4 py-2.5 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label={labels.back}
          >
            <ArrowLeft className="size-4" />
          </Button>

          <p className="text-sm font-medium text-foreground truncate min-w-0 flex-1">
            {headerTitle}
          </p>

          <div className="flex items-center gap-1.5 shrink-0">
            {isEdit && runningRun && onCancelRun ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancelRun(runningRun.id)}
              >
                <Square className="size-3.5" />
                {labels.stop}
              </Button>
            ) : (
              isEdit &&
              onRunNow && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRunNow}
                  disabled={runNowPending}
                >
                  <Play className="size-3.5" />
                  {runNowPending ? labels.starting : labels.runNow}
                </Button>
              )
            )}
            <Button onClick={onSubmit} size="sm" disabled={!canSubmit}>
              {isEdit ? labels.saveChanges : labels.createRoutine}
            </Button>
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.moreActions}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {onToggle && routine && (
                    <DropdownMenuItem
                      onClick={() => onToggle(!routine.enabled)}
                    >
                      <Pause className="size-3.5" />
                      {routine.enabled
                        ? labels.pauseRoutine
                        : labels.resumeRoutine}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={onDelete}
                      >
                        <Trash2 className="size-3.5" />
                        {labels.deleteRoutine}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Scrollable body — white canvas, gray cards stack vertically */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 pt-3 pb-12 space-y-3">
          {/* Hero composer — gray card holding three labeled white-well fields */}
          <section className="rounded-xl bg-secondary p-5 space-y-4">
            <div>
              <FieldLabel>{labels.nameLabel}</FieldLabel>
              <input
                type="text"
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder={labels.namePlaceholder}
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
                // biome-ignore lint/a11y/noAutofocus: focuses the name field on new-routine creation — intentional UX, no navigation disruption since the editor is a dedicated screen
                autoFocus={!isEdit}
              />
            </div>
            <div>
              <FieldLabel>{labels.descriptionLabel}</FieldLabel>
              <input
                type="text"
                value={value.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder={labels.descriptionPlaceholder}
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
              />
            </div>
            <div>
              <FieldLabel>{labels.promptLabel}</FieldLabel>
              <textarea
                value={value.prompt}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder={labels.promptPlaceholder}
                rows={5}
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground leading-relaxed",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none resize-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
              />
            </div>
          </section>

          <SectionCard title={labels.sectionWhen}>
            <ScheduleBuilder
              value={value.schedule}
              onChange={(schedule) => onChange({ schedule })}
              labels={scheduleLabels}
              locale={locale}
            />

            {/* Live "Next run" callout — white well inside the gray card */}
            <div className="flex items-start gap-3 rounded-lg bg-background border border-black/[0.04] px-4 py-3">
              <CalendarClock
                className="size-4 text-muted-foreground mt-0.5 shrink-0"
                strokeWidth={1.75}
              />
              <div className="min-w-0 flex-1">
                {nextDescr ? (
                  <>
                    <p className="text-sm text-foreground tabular-nums">
                      {interp(labels.nextRun, { relative: nextDescr.relative })}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      {nextDescr.absolute}
                      <span className="text-muted-foreground/60">
                        {" "}
                        · {accountTimezone.replace(/_/g, " ")}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {labels.schedulePreview}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {labels.schedulePreviewHint}
                    </p>
                  </>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={labels.sectionBehavior}>
            {modelPicker && (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{labels.modelTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {labels.modelDescription}
                  </p>
                </div>
                <div className="shrink-0">{modelPicker}</div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{labels.notifyTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {labels.notifyDescription}
                </p>
              </div>
              <Switch
                checked={value.suppress_when_silent}
                onCheckedChange={(checked) =>
                  onChange({ suppress_when_silent: checked })
                }
                aria-label={labels.notifyTitle}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{labels.chatTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {labels.chatDescription}
                </p>
              </div>
              <Switch
                checked={value.chat_mode === "shared"}
                onCheckedChange={(checked) =>
                  onChange({ chat_mode: checked ? "shared" : "per_run" })
                }
                aria-label={labels.chatTitle}
              />
            </div>
          </SectionCard>

          {isEdit && (
            <SectionCard title={labels.sectionRecent}>
              <RunHistory
                runs={runs}
                onViewActivity={onViewActivity}
                onCancelRun={onCancelRun}
                labels={runHistoryLabels}
                locale={locale}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
