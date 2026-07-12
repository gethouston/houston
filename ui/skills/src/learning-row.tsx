import { Trash2 } from "lucide-react";
import type { LearningCategory } from "./types";
import { CATEGORY_LABELS } from "./types";

export interface LearningRowProps {
  content: string;
  category: LearningCategory;
  sourceTitle: string | null;
  createdAt: string;
  onDelete: () => void;
}

export function LearningRow({
  content,
  category,
  sourceTitle,
  createdAt,
  onDelete,
}: LearningRowProps) {
  const label = CATEGORY_LABELS[category] ?? category;
  const date = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-xl border border-line p-4 group">
      <div className="flex items-start gap-3">
        <p className="text-sm text-ink flex-1 leading-relaxed">{content}</p>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 size-7 flex items-center justify-center rounded-lg text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors"
          aria-label="Delete learning"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs text-ink-muted">
        <span className="px-1.5 py-0.5 rounded-md bg-hover/50 text-ink-muted">
          {label}
        </span>
        {sourceTitle && (
          <span className="truncate max-w-[200px]">{sourceTitle}</span>
        )}
        <span>{date}</span>
      </div>
    </div>
  );
}
