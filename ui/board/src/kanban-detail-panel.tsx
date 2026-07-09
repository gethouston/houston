import { cn } from "@houston-ai/core";
import { Loader2, XIcon } from "lucide-react";
import { forwardRef } from "react";
import { KanbanPeople } from "./kanban-people";
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
  /** Large avatar shown in the header */
  avatar?: React.ReactNode;
  /** Name displayed next to the avatar (e.g. "Houston") */
  agentName?: string;
  /** Human contributors shown as an avatar face stack in the header. */
  people?: KanbanPerson[];
  /** Accessible group label for the people face stack (English default "People"). */
  peopleLabel?: string;
  /** Accessible label for the people stack's expandable "+N" chip. */
  peopleExpandLabel?: string;
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
    avatar,
    agentName,
    people,
    peopleLabel = "People",
    peopleExpandLabel,
    runningStatuses = ["running"],
    statusLabels,
  },
  ref,
) {
  const labels = statusLabels ?? STATUS_LABEL;
  const isRunning = status ? runningStatuses.includes(status) : false;
  const missionLabel = title ? `Mission: ${title}` : subtitle;

  return (
    <div ref={ref} className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {avatar}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {agentName ?? title}
            </p>
            {(agentName ? missionLabel : subtitle) && (
              <p className="text-xs text-muted-foreground truncate">
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
          {isRunning && (
            <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
          )}
          {people && people.length > 0 && (
            <KanbanPeople
              people={people}
              size="md"
              label={peopleLabel}
              expandable
              expandLabel={peopleExpandLabel}
              className="shrink-0"
            />
          )}
          {actions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors shrink-0"
            >
              <XIcon className="size-4" strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {children}
    </div>
  );
});
