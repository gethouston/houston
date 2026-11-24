import { cn } from "@houston-ai/core";
import { Loader2, XIcon } from "lucide-react";
import { forwardRef } from "react";
import { KanbanPeople } from "./kanban-people";
import { hasPeopleBeyond } from "./kanban-people-logic";
import { formatMessageTime, type MessageTimeFormatter } from "./message-time";
import type { KanbanPerson } from "./types";

const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  needs_you: "Needs You",
  done: "Done",
  approved: "Done",
  completed: "Done",
  error: "Failed",
  failed: "Failed",
};

export interface KanbanDetailPanelProps {
  title: string;
  lastMessageAt?: string;
  formatTime?: MessageTimeFormatter;
  lastMessageLabel?: (time: string) => string;
  subtitle?: string;
  status?: string;
  /** Omit to render a panel with no close button (a non-dismissable companion panel). */
  onClose?: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Rendered before the avatar (e.g. a Back button for a full-page panel). */
  leading?: React.ReactNode;
  /** Drop the header row entirely: the chat starts at the panel's top edge.
      The caller owns every affordance the header carried (close, actions). */
  hideHeader?: boolean;
  /** Large avatar shown in the header */
  avatar?: React.ReactNode;
  /** Name displayed next to the avatar (e.g. "Houston") */
  agentName?: string;
  /** Replaces the auto-generated "Mission: {title}" subtitle line verbatim. */
  missionLabelOverride?: string;
  /** Human contributors shown as an avatar face stack in the header. */
  people?: KanbanPerson[];
  /** The viewer. A stack that holds nobody BUT the viewer is not rendered:
   *  "who is on this task" only says something when someone else is. */
  selfId?: string;
  /** Accessible group label for the people face stack (English default "People"). */
  peopleLabel?: string;
  /** Accessible label for the people stack's expandable "+N" chip. */
  peopleExpandLabel?: string;
  /** Accessible label for the icon-only close button (English default). */
  closeLabel?: string;
  runningStatuses?: string[];
  statusLabels?: Record<string, string>;
}

export const KanbanDetailPanel = forwardRef<
  HTMLDivElement,
  KanbanDetailPanelProps
>(function KanbanDetailPanel(
  {
    title,
    lastMessageAt,
    formatTime = (iso, dateStyle) =>
      formatMessageTime(iso, undefined, undefined, undefined, dateStyle),
    lastMessageLabel = (time) => `Last message: ${time}`,
    subtitle,
    status,
    onClose,
    children,
    actions,
    leading,
    hideHeader,
    avatar,
    agentName,
    missionLabelOverride,
    people,
    selfId,
    peopleLabel = "People",
    peopleExpandLabel,
    closeLabel = "Close panel",
    runningStatuses = ["running"],
    statusLabels,
  },
  ref,
) {
  const labels = statusLabels ?? STATUS_LABEL;
  const isRunning = status ? runningStatuses.includes(status) : false;
  const missionLabel =
    missionLabelOverride ?? (title ? `Mission: ${title}` : subtitle);
  const showPeople = hasPeopleBeyond(people, selfId);

  return (
    <div ref={ref} className="flex flex-col h-full min-h-0">
      {!hideHeader && (
        <div className="@container relative flex shrink-0 items-center gap-3 bg-pane px-4 py-3">
          {leading && (
            <div className="shrink-0 @min-[67rem]:absolute @min-[67rem]:top-1/2 @min-[67rem]:left-4 @min-[67rem]:-translate-y-1/2">
              {leading}
            </div>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-3 max-w-3xl mx-auto">
            {avatar}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">
                {agentName ?? title}
              </p>
              {(agentName ? missionLabel : subtitle) && (
                <p className="text-xs text-ink-muted truncate">
                  {agentName ? missionLabel : subtitle}
                  {status && (
                    <>
                      {(agentName ? missionLabel : subtitle) && (
                        <span className="mx-1">&middot;</span>
                      )}
                      <span className={cn(isRunning && "text-action")}>
                        {labels[status] ?? status}
                      </span>
                    </>
                  )}
                </p>
              )}
              {lastMessageAt && (
                <p className="text-xs text-ink-muted">
                  <time dateTime={lastMessageAt} data-relative-time>
                    {lastMessageLabel(formatTime(lastMessageAt, "medium").full)}
                  </time>
                </p>
              )}
            </div>
            {showPeople && (
              <KanbanPeople
                people={people}
                size="md"
                surface="background"
                label={peopleLabel}
                roster
                expandLabel={peopleExpandLabel}
                className="shrink-0"
              />
            )}
            <div className="min-w-0 flex-1" />
            {isRunning && (
              <Loader2 className="size-4 animate-spin text-action shrink-0" />
            )}
            {actions}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="relative size-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-hover/50 transition-colors shrink-0 after:absolute after:-inset-y-2 after:-left-1 after:-right-2 md:after:hidden"
              >
                <XIcon className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}

      {children}
    </div>
  );
});
