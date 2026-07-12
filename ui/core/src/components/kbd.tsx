import type { ComponentProps } from "react";

import { cn } from "../utils";

function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-chip-subtle px-1 font-sans text-xs font-medium text-ink-muted select-none in-data-[slot=tooltip-content]:bg-input/20 in-data-[slot=tooltip-content]:text-input dark:in-data-[slot=tooltip-content]:bg-input/10 [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
