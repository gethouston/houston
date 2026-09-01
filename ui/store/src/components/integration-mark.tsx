"use client";

import { cn } from "@houston-ai/core";
import { useState } from "react";
import { integrationLogoUrl } from "../integrations";

/**
 * One integration's brand mark: the favicon-service image with a letter-tile
 * fallback. The favicon service answers 404 for a domain it cannot resolve
 * (guessed `<slug>.com` domains often are not real), and the bare `<img>`s
 * this replaces rendered those as broken/blank squares on the store cards.
 * A failed load latches to a quiet letter tile instead — honest, and it keeps
 * the "works with" row's count truthful.
 */
export function IntegrationMark({
  slug,
  label,
  className,
}: {
  slug: string;
  /** The resolved display label; its first letter is the fallback glyph. */
  label: string;
  /** Sizing from the call site (`size-4` on cards, `size-5` on the detail). */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className={cn(
          "grid shrink-0 place-items-center rounded bg-chip font-medium text-[9px] text-ink-muted",
          className,
        )}
      >
        {label.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={integrationLogoUrl(slug)}
      alt={label}
      title={label}
      className={cn("shrink-0", className)}
      onError={() => setFailed(true)}
    />
  );
}
