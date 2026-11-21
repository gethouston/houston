import type { ChatActionBrand } from "@houston-ai/chat";
import { cn } from "@houston-ai/core";
import { ExternalLink, Globe, Wrench } from "lucide-react";
import { useState } from "react";

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
