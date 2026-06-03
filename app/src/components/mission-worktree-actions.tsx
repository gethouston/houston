import type { KanbanItem } from "@houston-ai/board";
import { GitBranch, Terminal } from "lucide-react";

interface MissionWorktreeActionLabels {
  openTerminal: string;
  run: string;
}

function worktreePath(item: KanbanItem): string | undefined {
  const value = item.metadata?.worktreePath;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function MissionWorktreeCardAction({
  item,
  labels,
  onRun,
}: {
  item: KanbanItem;
  labels: MissionWorktreeActionLabels;
  onRun: (item: KanbanItem) => void;
}) {
  if (!worktreePath(item)) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onRun(item);
      }}
      className="flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-secondary text-foreground text-[10px] font-medium hover:bg-accent transition-colors duration-200"
      title={labels.openTerminal}
    >
      <Terminal className="size-2.5" />
      {labels.run}
    </button>
  );
}

export function MissionWorktreePanelActions({
  item,
  labels,
  onRun,
}: {
  item: KanbanItem;
  labels: MissionWorktreeActionLabels;
  onRun: (item: KanbanItem) => void;
}) {
  const path = worktreePath(item);
  if (!path) return null;
  const label = path.split("/").pop() ?? path;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="flex items-center gap-1 h-5 px-1.5 rounded-full bg-secondary text-muted-foreground text-[10px] font-medium truncate max-w-[160px]"
        title={path}
      >
        <GitBranch className="size-2.5 shrink-0" />
        {label}
      </span>
      <button
        onClick={() => onRun(item)}
        className="flex items-center gap-0.5 h-5 px-1.5 rounded-full bg-secondary text-foreground text-[10px] font-medium hover:bg-accent transition-colors duration-200"
        title={labels.openTerminal}
      >
        <Terminal className="size-2.5" />
        {labels.run}
      </button>
    </div>
  );
}
