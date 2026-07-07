import { useState } from "react";
import { customFaviconUrl } from "./custom-integration-card-state";

/**
 * A hostname-favicon logo with an initial-letter fallback (span-free block form,
 * since the setup cards replace the composer rather than nesting in prose). Shared
 * by the custom-integration and MCP-server cards; `url` is any https URL and the
 * favicon is resolved from its hostname.
 */
export function ProposalLogo({ name, url }: { name: string; url: string }) {
  const [imgError, setImgError] = useState(false);
  const favicon = customFaviconUrl(url);
  if (imgError || !favicon) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent">
        <span className="text-xs font-semibold text-muted-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={favicon}
      alt={name}
      className="size-8 shrink-0 rounded-lg object-contain"
      onError={() => setImgError(true)}
    />
  );
}
