/**
 * RoutineEditor — single screen for both creating and editing a routine.
 *
 * Layout: white canvas (matches app shell), single header bar at the top,
 * scrolling body composed of typographic sections separated by hairlines.
 * The composer hero is the only "boxed" element — it's the substance of the
 * routine — everything else is plain settings rows.
 */
import { useMemo } from "react"
import {
  cn,
  Button,
  Switch,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core"
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Trash2,
  Globe,
  CalendarClock,
  MoreHorizontal,
} from "lucide-react"
import type { Routine, RoutineChatMode, RoutineRun } from "./types"
import { ScheduleBuilder } from "./schedule-builder"
import { RunHistory } from "./run-history"
import { nextFire, describeNextFire } from "./next-fire"
import { useNow } from "./use-now"

export interface RoutineFormData {
  name: string
  description: string
  prompt: string
  schedule: string
  suppress_when_silent: boolean
  /** Whether each run reuses one chat (`"shared"`) or starts a fresh one. */
  chat_mode: RoutineChatMode
  /** IANA timezone override. `null`/empty means use the account default. */
  timezone?: string | null
  /** Composio toolkit slugs this routine uses. */
  integrations: string[]
}

export interface RoutineEditorProps {
  value: RoutineFormData
  onChange: (patch: Partial<RoutineFormData>) => void
  onBack: () => void
  onSubmit: () => void
  /** Falsy = "new" mode. Provide the existing routine to enter edit mode. */
  routine?: Routine
  runs?: RoutineRun[]
  onRunNow?: () => void
  /** Disable the "Run now" button while a manual-run request is in flight.
   *  Guards against spam-click races where the disk-state `running` row
   *  hasn't propagated through TanStack invalidation yet — without this,
   *  each extra click queues a redundant request that the engine then
   *  rejects with 409 (or, on older builds, recorded as a conflict-error
   *  row in run history). */
  runNowPending?: boolean
  /** Stop an in-flight run. When present + a run is `running`, the header
   *  "Run now" button swaps to "Stop" and the matching run row shows a stop
   *  control. */
  onCancelRun?: (runId: string) => void
  onToggle?: (enabled: boolean) => void
  onDelete?: () => void
  onViewActivity?: (activityId: string) => void
  /** IANA tz of the user's account preference, used for the "next run" hint. */
  accountTimezone: string
  /** Disable Save when the form hasn't actually been touched. */
  hasChanges?: boolean
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Bogota",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
]

function listTimezones(): string[] {
  try {
    const supported = (
      Intl as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf?.("timeZone")
    if (supported && supported.length) return supported
  } catch {
    // fall through
  }
  return COMMON_TIMEZONES
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
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-secondary px-5 py-5">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
      {children}
    </label>
  )
}

const baseFieldClass = cn(
  "w-full rounded-lg border border-border/20 bg-background px-3 py-2 text-sm",
  "text-foreground placeholder:text-muted-foreground/60",
  "transition-shadow duration-200",
  "focus:outline-none focus:shadow-sm",
)

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
}: RoutineEditorProps) {
  const runningRun = runs.find((r) => r.status === "running")
  const isEdit = !!routine
  const canSubmit =
    !!value.name.trim() &&
    !!value.prompt.trim() &&
    !!value.schedule.trim() &&
    (!isEdit || hasChanges !== false)

  const timezones = useMemo(listTimezones, [])
  const tzValue = value.timezone ?? ""
  const effectiveTz = value.timezone || accountTimezone

  // Live "next run" preview, ticking every minute.
  const now = useNow(60_000)
  const next = useMemo(
    () => (value.schedule ? nextFire(value.schedule, effectiveTz, now) : null),
    [value.schedule, effectiveTz, now],
  )
  const nextDescr = next ? describeNextFire(next, effectiveTz, now) : null

  // Header title — live, mirrors what the user is typing.
  const headerTitle = isEdit
    ? value.name.trim() || routine?.name || "Untitled routine"
    : "New routine"
  const hasOverflow = isEdit && (onToggle || onDelete)

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Single action bar: back · context · primary on right */}
      <header className="px-4 py-2.5 shrink-0">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            aria-label="Back to routines"
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
                Stop
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
                  {runNowPending ? "Starting…" : "Run now"}
                </Button>
              )
            )}
            <Button onClick={onSubmit} size="sm" disabled={!canSubmit}>
              {isEdit ? "Save changes" : "Create routine"}
            </Button>
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {onToggle && routine && (
                    <DropdownMenuItem onClick={() => onToggle(!routine.enabled)}>
                      <Pause className="size-3.5" />
                      {routine.enabled ? "Pause routine" : "Resume routine"}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={onDelete}>
                        <Trash2 className="size-3.5" />
                        Delete routine
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
              <FieldLabel>Name</FieldLabel>
              <input
                type="text"
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                placeholder="e.g. Morning standup"
                className={cn(
                  "w-full px-3 py-2 text-sm text-foreground",
                  "placeholder:text-muted-foreground/60",
                  "bg-background border border-black/[0.04] rounded-lg",
                  "outline-none transition-shadow duration-200",
                  "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                )}
                autoFocus={!isEdit}
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <input
                type="text"
                value={value.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="Optional — what this routine is for"
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
              <FieldLabel>Prompt</FieldLabel>
              <textarea
                value={value.prompt}
                onChange={(e) => onChange({ prompt: e.target.value })}
                placeholder="What should the agent do when this runs?"
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

          <SectionCard title="When it runs">
            <ScheduleBuilder
              value={value.schedule}
              onChange={(schedule) => onChange({ schedule })}
            />

            <div>
              <FieldLabel>Timezone</FieldLabel>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <select
                  value={tzValue}
                  onChange={(e) =>
                    onChange({
                      timezone: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  className={cn(
                    baseFieldClass,
                    "pl-9 appearance-none cursor-pointer",
                  )}
                >
                  <option value="">
                    Account default · {accountTimezone}
                  </option>
                  {timezones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
                      Next run {nextDescr.relative}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                      {nextDescr.absolute}
                      <span className="text-muted-foreground/60">
                        {" "}· {effectiveTz}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Schedule preview
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Pick a valid schedule to see when this routine will fire.
                    </p>
                  </>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Behavior">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  Only notify when relevant
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  If the agent has nothing to report, the run won't surface on
                  the board.
                </p>
              </div>
              <Switch
                checked={value.suppress_when_silent}
                onCheckedChange={(checked) =>
                  onChange({ suppress_when_silent: checked })
                }
                aria-label="Only notify when relevant"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  Keep results in one chat
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Every run adds to the same chat. Turn this off to start a new
                  chat each time this routine runs.
                </p>
              </div>
              <Switch
                checked={value.chat_mode === "shared"}
                onCheckedChange={(checked) =>
                  onChange({ chat_mode: checked ? "shared" : "per_run" })
                }
                aria-label="Keep results in one chat"
              />
            </div>
          </SectionCard>

          {isEdit && (
            <SectionCard title="Recent runs">
              <RunHistory
                runs={runs}
                onViewActivity={onViewActivity}
                onCancelRun={onCancelRun}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  )
}
