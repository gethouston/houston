import { cn } from "@houston-ai/core";
import { Check, Loader2, Plus } from "lucide-react";

/**
 * Shared install-status glyph for the marketplace card and preview sheet: a
 * spinner while installing, a check once installed, otherwise a plus. Callers
 * size it via `className` (e.g. `size-4`).
 */
export function InstallStatusIcon({
  status,
  className,
}: {
  status: "idle" | "installing" | "installed";
  className?: string;
}) {
  if (status === "installing")
    return <Loader2 className={cn("animate-spin", className)} />;
  if (status === "installed") return <Check className={className} />;
  return <Plus className={className} />;
}
