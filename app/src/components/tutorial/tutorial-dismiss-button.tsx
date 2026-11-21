import { cn } from "@houston-ai/core";
import { X } from "lucide-react";

export function TutorialDismissButton(props: {
  label: string;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onDismiss}
      className={cn(
        "absolute rounded-lg p-1.5 text-ink-muted outline-none transition-colors duration-200 hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50",
        props.className,
      )}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
