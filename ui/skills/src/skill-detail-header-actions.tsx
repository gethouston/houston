import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Lock, MoreHorizontal, Trash2 } from "lucide-react";

export interface SkillDetailHeaderActionsLabels {
  saveChanges: string;
  savingChanges: string;
  moreOptions: string;
  delete: string;
  managedNote: string;
}

export interface SkillDetailHeaderActionsProps {
  /**
   * Read-only mode (a non-manager on a managed agent): render the managed-note
   * indicator instead of the Save + Delete affordances.
   */
  readOnly: boolean;
  isDirty: boolean;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onRequestDelete: () => void;
  labels: SkillDetailHeaderActionsLabels;
}

/**
 * Trailing action cluster of the skill detail header. Split out of
 * `SkillDetailPage` so the two header variants (read-only note vs. the editable
 * Save/Delete controls) live in one focused component and the page file stays
 * under the file-size limit.
 */
export function SkillDetailHeaderActions({
  readOnly,
  isDirty,
  saving,
  deleting,
  onSave,
  onRequestDelete,
  labels,
}: SkillDetailHeaderActionsProps) {
  if (readOnly) {
    return (
      <span className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        {labels.managedNote}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Button
        size="sm"
        onClick={onSave}
        disabled={!isDirty || saving || deleting}
      >
        {saving ? labels.savingChanges : labels.saveChanges}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.moreOptions}
            disabled={deleting}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem variant="destructive" onClick={onRequestDelete}>
            <Trash2 className="size-3.5" />
            {labels.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
