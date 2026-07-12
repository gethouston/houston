import type * as React from "react";

import { cn } from "../utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-line-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/20 md:text-sm dark:bg-line-input/30 dark:aria-invalid:ring-danger/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
