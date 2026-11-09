import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** The accessible name, also the tooltip. */
  label: string;
  /** A toggle's state: pressed toggles keep a filled background. */
  pressed?: boolean;
  /** The key that does the same, shown in the tooltip. */
  shortcut?: string;
}

/**
 * The preview header's one icon button: a fixed 32px square with the 16px
 * glyph centered on the grid (never padding-centered, which drifts with the
 * glyph's own box), a tooltip, and press feedback.
 */
export function IconButton({
  icon: Icon,
  label,
  pressed,
  shortcut,
  className,
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          className={cn(
            "preview-press grid size-8 shrink-0 place-items-center rounded-lg text-hover-text outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-40",
            "hover:bg-hover hover:text-ink aria-pressed:bg-hover aria-pressed:text-ink",
            className,
          )}
          {...props}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
        {shortcut && (
          <kbd className="ml-1.5 font-sans text-[11px] opacity-60">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
