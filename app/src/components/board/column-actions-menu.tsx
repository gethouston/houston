import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ListChecks, MoreHorizontal } from "lucide-react";

export interface ColumnActionsMenuProps {
  /** Add every card in this column to the multi-select set. */
  onSelectAll: () => void;
  labels: {
    /** Accessible label for the kebab trigger. */
    menu: string;
    /** "Select all in column". */
    selectAll: string;
  };
}

/**
 * Kebab (three-dot) menu rendered in a board column header. Offers "Select all
 * in column", which seeds a section-locked multi-selection so the floating bulk
 * bar takes over for archive / move / delete. Same affordance on every column
 * that supports multi-select.
 */
export function ColumnActionsMenu({ onSelectAll, labels }: ColumnActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={labels.menu}
          onClick={(e) => e.stopPropagation()}
          className="text-muted-foreground/60 hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onSelectAll}>
          <ListChecks className="size-3.5" />
          {labels.selectAll}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
