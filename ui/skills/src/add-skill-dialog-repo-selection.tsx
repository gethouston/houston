import type { RepoViewLabels } from "./add-skill-dialog-repo-labels";

export function RepoSelectionSummary({
  skillCount,
  selectedCount,
  labels,
  onToggleAll,
}: {
  skillCount: number;
  selectedCount: number;
  labels: Required<RepoViewLabels>;
  onToggleAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-1">
      <p className="text-xs text-ink-muted">{labels.skillsFound(skillCount)}</p>
      <button
        type="button"
        onClick={onToggleAll}
        className="text-xs text-ink-muted hover:text-ink transition-colors"
      >
        {selectedCount === skillCount ? labels.deselectAll : labels.selectAll}
      </button>
    </div>
  );
}
