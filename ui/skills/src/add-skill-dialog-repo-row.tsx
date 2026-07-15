import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { RepoSkill } from "./types";

export function RepoSkillRow({
  skill,
  selected,
  onToggle,
}: {
  skill: RepoSkill;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className="w-full flex items-center gap-3 px-6 py-3 hover:bg-hover/50 transition-colors text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{skill.name}</p>
        <p className="text-xs text-ink-muted truncate">
          {skill.description || skill.path}
        </p>
      </div>
      <div
        className={cn(
          "shrink-0 size-4 rounded border flex items-center justify-center transition-colors",
          selected ? "bg-ink border-ink" : "border-line bg-input",
        )}
      >
        {selected && <Check className="size-2.5 text-input" />}
      </div>
    </button>
  );
}
