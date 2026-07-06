import { Button } from "@houston-ai/core";
import { LayoutTemplate, Trash2 } from "lucide-react";

interface OrgTemplateCardProps {
  name: string;
  description: string;
  /** The composed summary line, e.g. "3 skills · Claude · 2 apps". */
  meta: string;
  /** "Created by …" line (already resolved to a name). */
  createdBy: string;
  /** Whether to show the delete affordance (owner or the template's creator). */
  canDelete: boolean;
  /** Accessible label for the delete action (already translated). */
  deleteLabel: string;
  onDelete: () => void;
}

/**
 * One template tile in the Organization > Templates grid (Teams v2): a template
 * glyph + name, its description, the plain-language summary line, who created it,
 * and a delete action gated to the owner or the creator. Presentational only —
 * the tab resolves every string and decides `canDelete`. The delete button is
 * always visible (no hover-only affordance).
 */
export function OrgTemplateCard({
  name,
  description,
  meta,
  createdBy,
  canDelete,
  deleteLabel,
  onDelete,
}: OrgTemplateCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
        >
          <LayoutTemplate className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          {description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-1 shrink-0 rounded-lg text-muted-foreground hover:text-destructive"
            aria-label={deleteLabel}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{meta}</span>
        <span className="shrink-0 truncate">{createdBy}</span>
      </div>
    </div>
  );
}
