import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";

/**
 * The shared "done" mark: a filled monochrome circle with a check that pops in.
 * `lg` (with an expanding ring) headlines a full success screen; `md` confirms
 * an inline connected state. One component so every success beat looks the same.
 */
export function SuccessCheck({
  size = "md",
  ring = false,
}: {
  size?: "md" | "lg";
  ring?: boolean;
}) {
  const box = size === "lg" ? "size-20" : "size-14";
  const icon = size === "lg" ? "size-10" : "size-7";
  return (
    <span className={cn("relative flex items-center justify-center", box)}>
      {ring && (
        <span
          aria-hidden
          className="success-ring absolute inset-0 rounded-full border-2 border-foreground/40"
        />
      )}
      <span
        className={cn(
          "success-pop flex items-center justify-center rounded-full bg-foreground text-background",
          box,
        )}
      >
        <Check className={icon} strokeWidth={2.5} />
      </span>
    </span>
  );
}
