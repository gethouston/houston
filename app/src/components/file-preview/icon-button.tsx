import { cn, Tooltip, TooltipContent, TooltipTrigger } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  pressed?: boolean;
  shortcut?: string;
}

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
