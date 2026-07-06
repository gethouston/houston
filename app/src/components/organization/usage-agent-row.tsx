import { cn, HoustonAvatar } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { UsageAgent } from "./org-usage-model";

interface UsageAgentRowProps {
  agent: UsageAgent;
  /** Display name resolved from the slug. */
  name: string;
  /** Resolved agent color (semantic hex), for the avatar tint. */
  color?: string;
  /** Busiest agent's total, to scale this row's bar. */
  max: number;
  /** Resolve a user id in the per-person breakdown to a display name. */
  memberName: (userId: string) => string;
}

/**
 * One agent's usage bar (Teams v2 Usage tab): name + total messages + a plain
 * styled bar, expandable to a per-person breakdown. The toggle is a real
 * button (keyboard + `aria-expanded`), never hover-gated. All lengths/colors
 * come from design tokens.
 */
export function UsageAgentRow({
  agent,
  name,
  color,
  max,
  memberName,
}: UsageAgentRowProps) {
  const { t } = useTranslation("teams");
  const [open, setOpen] = useState(false);
  const pct = Math.max(2, Math.round((agent.messages / max) * 100));

  return (
    <li className="border-b border-border/40 py-3 last:border-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
        />
        <HoustonAvatar color={color} diameter={28} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-medium text-foreground">
              {name}
            </span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {t("usageTab.messages", { count: agent.messages })}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>

      {open && (
        <ul className="mt-2 ml-7 flex flex-col gap-1">
          {agent.people.map((p) => (
            <li
              key={p.userId}
              className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground"
            >
              <span className="truncate">{memberName(p.userId)}</span>
              <span className="shrink-0">
                {t("usageTab.messages", { count: p.messages })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
