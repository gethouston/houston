import { cn } from "@houston-ai/core";
import { Check, Loader2, Plus } from "lucide-react";
import type { CommunitySkill } from "./types";

export interface CommunitySkillRowProps {
  skill: CommunitySkill;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Convert "vercel-react-best-practices" to "Vercel React Best Practices" */
function kebabToTitle(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function CommunitySkillRow({
  skill,
  installing,
  installed,
  onInstall,
}: CommunitySkillRowProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border
                 bg-background hover:border-border/80 transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {kebabToTitle(skill.name)}
        </p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {skill.source} · {formatInstalls(skill.installs)} installs
        </p>
      </div>
      <button
        type="button"
        onClick={onInstall}
        disabled={installing || installed}
        className={cn(
          "shrink-0 size-7 flex items-center justify-center rounded-lg transition-colors",
          installed
            ? "text-muted-foreground cursor-default"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
          installing && "opacity-50 cursor-wait",
        )}
      >
        {installing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : installed ? (
          <Check className="size-4" />
        ) : (
          <Plus className="size-4" />
        )}
      </button>
    </div>
  );
}
