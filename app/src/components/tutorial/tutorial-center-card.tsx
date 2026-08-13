import { Button, cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { TutorialDismissButton } from "./tutorial-dismiss-button";

/** A labeled row of a lesson's checklist (state from `in-app-setup-checklist`). */
export interface LabeledChecklistItem {
  id: string;
  label: string;
  state: "done" | "current" | "todo";
}

/**
 * A tutorial's WHAT position: a centered, calm card narrating the step ahead
 * (or just completed), over a light scrim that keeps the app clearly visible
 * behind it. One primary action — plus the lesson's checklist, so every beat
 * reads as REQUIRED progress visibly completing, never a skippable tour. The
 * HOW position is `tutorial-spotlight.tsx`.
 */
export function TutorialCenterCard({
  header,
  title,
  body,
  cta,
  onNext,
  checklist,
  onDismiss,
  dismissLabel,
}: {
  /** What crowns the card — the lesson's own mark or badge. */
  header?: ReactNode;
  title: string;
  /** A node so callers can emphasize within translated copy (`<Trans>`). */
  body: ReactNode;
  cta: string;
  onNext: () => void;
  checklist?: LabeledChecklistItem[];
  /** A way out, when the flow HAS one. Absent for the mandatory setup, which
   *  then renders no close at all. */
  onDismiss?: () => void;
  /** Names the close for a screen reader; the button is icon-only. */
  dismissLabel?: string;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Light veil on purpose — the user must SEE the app they are about to
      // be guided through. z-40: above shell chrome (≤ z-30), below the z-50
      // dialog/toast layer.
      className="ht-tutorial-scrim fixed inset-0 z-40 flex items-center justify-center p-6 duration-200 animate-in fade-in-0"
    >
      <div className="ht-tutorial-card-shadow relative flex w-full max-w-md flex-col items-center rounded-2xl border border-ink/5 bg-input p-8 text-center duration-200 ease-out animate-in fade-in-0 zoom-in-95">
        {onDismiss && dismissLabel && (
          <TutorialDismissButton
            label={dismissLabel}
            onDismiss={onDismiss}
            className="top-4 right-4"
          />
        )}
        {header}
        <h1 className="mt-4 text-2xl font-normal text-balance text-ink">
          {title}
        </h1>
        <p className="mt-2 text-base text-balance text-ink-muted">{body}</p>
        {checklist && checklist.length > 0 && (
          <ul className="mt-7 w-full max-w-sm space-y-1 text-left">
            {checklist.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2",
                  // The item being worked on wears the highlight — the list
                  // itself says where we are, so titles don't have to.
                  item.state === "current" && "bg-chip",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                    item.state === "done"
                      ? "bg-action text-action-text"
                      : "border-[1.5px] border-line-input",
                  )}
                >
                  {item.state === "done" && <Check className="h-3.5 w-3.5" />}
                </span>
                <span
                  className={cn(
                    "text-[15px]",
                    item.state === "done" && "text-ink-muted",
                    item.state === "current" && "font-medium text-ink",
                    item.state === "todo" && "text-ink-muted",
                  )}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button
          autoFocus
          size="lg"
          className="mt-8 rounded-full active:scale-[0.96]"
          onClick={onNext}
        >
          {cta}
        </Button>
      </div>
    </div>
  );
}
