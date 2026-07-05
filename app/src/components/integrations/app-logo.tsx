import { cn } from "@houston-ai/core";
import { useState } from "react";
import type { AppDisplay } from "./app-display";

const SIZES = {
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
} as const;

/**
 * The app's logo, with an initial-letter fallback when the image is missing or
 * fails to load. The box is a fixed size in every state, so swapping the img for
 * the letter never shifts surrounding layout.
 */
export function AppLogo({
  display,
  size = "md",
  className,
}: {
  display: AppDisplay;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const box = cn(SIZES[size], "shrink-0 rounded-lg bg-background", className);

  if (imgError || !display.logoUrl) {
    return (
      <div className={cn(box, "flex items-center justify-center")}>
        <span className="text-xs font-semibold text-muted-foreground">
          {display.name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={display.logoUrl}
      alt={display.name}
      className={cn(box, "object-contain")}
      onError={() => setImgError(true)}
    />
  );
}
