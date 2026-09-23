import type { ChatActionBrand } from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import { ExternalLink, Globe, Wrench } from "lucide-react";
import { useState } from "react";

/**
 * An external-artifact row of the turn-end summary (PRODUCT-1196): the app's
 * logo (wrench for custom integrations, globe when no brand art resolves or
 * the favicon 404s) + `{name} · {Sent email}`. With a URL the whole row is a
 * button that opens the artifact and wears a visible external-link glyph
 * (never hover-gated); without one it is a plain fact row.
 */
export function IntegrationUpdateRow({
  action,
  url,
  brand,
  onOpenUrl,
}: {
  action: string;
  url?: string;
  brand: ChatActionBrand | undefined;
  onOpenUrl: (url: string) => void;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  // The brand resolver only misses on an empty action; still, never render a
  // raw slug — de-underscore it into words as the last resort.
  const label = brand
    ? `${brand.name} · ${brand.doneLabel ?? brand.actionLabel}`
    : action.replace(/_/g, " ").toLowerCase();
  const icon =
    brand?.icon === "tool" ? (
      <Wrench aria-hidden className="h-4 w-4 text-ink-muted shrink-0" />
    ) : brand?.logoUrl && !logoFailed ? (
      <img
        alt=""
        className="h-4 w-4 shrink-0 rounded object-contain"
        decoding="async"
        loading="lazy"
        onError={() => setLogoFailed(true)}
        src={brand.logoUrl}
      />
    ) : (
      <Globe aria-hidden className="h-4 w-4 text-ink-muted shrink-0" />
    );
  const body = (
    <>
      {icon}
      <span className="truncate">{label}</span>
      {url && (
        <ExternalLink
          aria-hidden
          className="h-3.5 w-3.5 text-ink-muted shrink-0 ml-auto"
        />
      )}
    </>
  );
  const rowClass = "w-full flex items-center gap-2 px-3 py-2 text-sm text-left";
  if (!url) return <div className={rowClass}>{body}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpenUrl(url)}
      className={cn(rowClass, "hover:bg-hover transition-colors")}
    >
      {body}
    </button>
  );
}
