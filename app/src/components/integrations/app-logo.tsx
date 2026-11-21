import { cn } from "@houston-ai/core";
import { useState } from "react";
import type { AppDisplay } from "./app-display";
import { curatedLogoUrl } from "./curated-logos";

const SIZES = {
  xs: "size-4",
  sm: "size-6",
  md: "size-8",
  lg: "size-10",
  xl: "size-14",
} as const;

const LETTER_SIZE = {
  xs: "text-[9px]",
  sm: "text-xs",
  md: "text-xs",
  lg: "text-xs",
  xl: "text-lg",
} as const;

export function AppLogo({
  display,
  size = "md",
  className,
}: {
  display: AppDisplay;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const box = cn(SIZES[size], "shrink-0 rounded-lg", className);

  const logoUrl = curatedLogoUrl(display.toolkit) || display.logoUrl;

  if (!logoUrl || failedUrl === logoUrl) {
    return (
      <span className={cn(box, "flex items-center justify-center bg-input")}>
        <span className={cn("font-semibold text-ink-muted", LETTER_SIZE[size])}>
          {display.name.charAt(0).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <img
      src={logoUrl}
      alt={display.name}
      loading="lazy"
      decoding="async"
      className={cn(box, "object-contain")}
      onError={() => setFailedUrl(logoUrl)}
    />
  );
}
