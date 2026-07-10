/**
 * NewRoutineMenu — the "New routine" split trigger: With AI (guided chat,
 * agent asks what/when and creates it) or Manually (opens a LOCAL, uncommitted
 * editor at the top of the list — name/schedule/instruction — that only writes
 * a routine to disk on Save; no screen change).
 */
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { Pencil, Plus, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";

export interface NewRoutineMenuProps {
  onCreateWithAi: () => void;
  onCreateManually: () => void;
  labels?: RoutinesGridLabels;
  size?: "default" | "sm";
  /** Icon for the "With AI" entry. App supplies the real brand mark
   *  (`ui/` stays brand-agnostic per the library boundary); a generic
   *  wand is the standalone-caller default. */
  aiIcon?: ReactNode;
}

export function NewRoutineMenu({
  onCreateWithAi,
  onCreateManually,
  labels = DEFAULT_GRID_LABELS,
  size = "default",
  aiIcon = <Wand2 className="size-3.5" />,
}: NewRoutineMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} className="shrink-0">
          <Plus className={size === "sm" ? "size-3.5" : "size-4"} />
          {labels.newRoutine}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={onCreateWithAi}>
          {aiIcon}
          {labels.newRoutineWithAi}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateManually}>
          <Pencil className="size-3.5" />
          {labels.newRoutineManually}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
