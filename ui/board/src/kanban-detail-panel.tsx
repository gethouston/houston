import { cn } from "@houston-ai/core";
import { Loader2, XIcon } from "lucide-react";
import { forwardRef } from "react";
import { KanbanPeople } from "./kanban-people";
import { hasPeopleBeyond } from "./kanban-people-logic";
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
      {/* Header — capped at the same reading width as the message column
          (below) and centered, so a full-width panel (e.g. the Routines
          chat) doesn't leave the header stranded at the far left while the
          content centers itself. A no-op for narrower panels: the cap never
          engages below max-w-3xl, so a normal 45%-width mission panel looks
          exactly as before. */}
      {/* Borderless header on the chat canvas tone: it reads as part of the
          chat surface rather than a separate bar (`bg-background` is the SAME
          token ChatPanel and the panes wear, so header, chat, and pane are
          one color — no seam on the light canvas / dark transparent). */}
      {!hideHeader && (
        <div className="shrink-0 bg-background px-4 py-3 dark:bg-transparent">
          <div className="flex items-center gap-3 max-w-3xl mx-auto w-full">
            {leading}
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
                      <span className={cn(isRunning && "text-blue-500")}>
                        {labels[status] ?? status}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            {/* The people stack sits on the LEFT with the identity block: it
              is about the task, while the menu and the window controls are
              about the panel and sit together at the right edge. It is a
              button (the roster popover) so it works on touch; a hover
              tooltip alone was dead on a phone. Absent when nobody but the
              viewer is on the task, where it only ever showed your own face. */}
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
              <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
            )}
            {actions}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className="size-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-hover/50 transition-colors shrink-0"
              >
                <XIcon className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      {children}
    </div>
  );
});
