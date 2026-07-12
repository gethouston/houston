/**
 * SkillRow - one row in the Actions list.
 *
 * Visual: transparent row sitting on a gray container card. Whole row
 * clickable; delete tucked into an overflow menu.
 */
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { Skill } from "./types";

export interface SkillRowProps {
  skill: Skill;
  onClick: () => void;
  onDelete?: () => void;
}

export function SkillRow({ skill, onClick, onDelete }: SkillRowProps) {
  const displayName = humanizeSkillName(skill.name);

  return (
    <button
      type="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group flex items-start gap-3 px-5 py-4 cursor-pointer w-full text-left",
        "bg-transparent border-0 p-0",
        "transition-colors duration-150",
        "hover:bg-ink/[0.03]",
        "focus-visible:outline-none focus-visible:bg-ink/[0.03]",
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{displayName}</p>
        {skill.description && (
          <p className="text-xs text-ink-muted line-clamp-2 mt-0.5 leading-snug">
            {skill.description}
          </p>
        )}
      </div>
      {onDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
              className="shrink-0 -mr-1"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              Delete action
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </button>
  );
}

function humanizeSkillName(slug: string): string {
  // Tolerate a missing/empty identity: a display helper must never crash the
  // whole view. Degrade gracefully rather than throw on `undefined`.
  if (!slug) return "";
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
