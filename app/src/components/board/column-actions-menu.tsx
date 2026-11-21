import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ListChecks, MoreHorizontal } from "lucide-react";

export interface ColumnActionsMenuProps {
  onSelectAll: () => void;
  labels: {
    menu: string;
    selectAll: string;
  };
}

export function ColumnActionsMenu({
  onSelectAll,
  labels,
}: ColumnActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={labels.menu}
          onClick={(e) => e.stopPropagation()}
          className="text-ink-muted/60 hover:text-ink"
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
