import { Badge } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * One fork option in a chooser dialog (the custom-add fork, the curated
 * connect fork). The `lead` emphasis marks the recommended path: a filled
 * chip surface + ink glyph, a clear step above its quiet sibling — the weight
 * carries the recommendation (content stays near-monochrome); an optional
 * `badge` can also say it out loud ("Recommended"). Both cards are always
 * visible: nothing here is gated on hover.
 */
export function ChoiceCard({
  icon,
  title,
  description,
  emphasis = "quiet",
  badge,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  emphasis?: "lead" | "quiet";
  /** Small chip beside the title (e.g. the translated "Recommended"). */
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const lead = emphasis === "lead";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-3 rounded-xl border border-line px-4 py-3 text-left transition-[background-color,transform] duration-200 hover:bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 ${
        lead ? "bg-chip" : ""
      }`}
    >
      <span className={`mt-0.5 ${lead ? "text-ink" : "text-ink-muted"}`}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
          <span className="min-w-0 break-words">{title}</span>
          {badge && (
            <Badge variant="secondary" className="shrink-0">
              {badge}
            </Badge>
          )}
        </span>
        <span className="mt-0.5 block text-[13px] text-ink-muted">
          {description}
        </span>
      </span>
    </button>
  );
}
