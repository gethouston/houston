import { cn } from "@houston-ai/core";
import { Check, Minus } from "lucide-react";
import { useEffect, useRef } from "react";

export function FilesCheckbox({
  checked,
  indeterminate,
  label,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <span
      className={cn(
        "relative flex size-3.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
        checked || indeterminate
          ? "border-action bg-action text-action-text"
          : "border-ink-muted/40 text-transparent group-hover/row:border-ink",
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer opacity-0"
      />
      {indeterminate ? (
        <Minus
          aria-hidden
          className="pointer-events-none size-3"
          strokeWidth={3}
        />
      ) : (
        <Check
          aria-hidden
          className="pointer-events-none size-3"
          strokeWidth={3}
        />
      )}
    </span>
  );
}
