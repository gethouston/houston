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
      <p className="text-xs text-muted-foreground">
        {labels.skillsFound(skillCount)}
      </p>
      <button
        type="button"
        onClick={onToggleAll}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {selectedCount === skillCount ? labels.deselectAll : labels.selectAll}
      </button>
    </div>
  );
}
