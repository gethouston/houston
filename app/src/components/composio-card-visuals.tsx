import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import type { ComposioCardView } from "./composio-card-state";

/**
 * Presentational right-slot for the Composio card. Keeps connection
 * *status* (a badge) visually distinct from the connect *action* (the
 * arrows button), which is the core of the issue #379 fix — the old card
 * fused them into one ambiguous "I've connected" control.
 *
 *   - connected  → green "Connected" badge + arrows reconnect button
 *   - connecting → "Connecting…" loading badge + arrows reconnect button
 *   - idle       → single "Connect" call-to-action
 *
 * `onConnect` drives every path: the Connect CTA and the arrows button both
 * (re)open the auth flow.
 */
export function ComposioStatusSlot({
  view,
  onConnect,
}: {
  view: ComposioCardView;
  onConnect: () => void;
}) {
  const { t } = useTranslation("chat");

  const reconnectButton = (
    <button
      type="button"
      onClick={onConnect}
      aria-label={t("composio.reconnect")}
      title={t("composio.reconnect")}
      className="inline-flex items-center justify-center size-7 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors duration-200 shrink-0"
    >
      <RefreshCw className="size-3.5" />
    </button>
  );

  if (view === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
          <Check className="size-3" />
          {t("composio.connected")}
        </span>
        {reconnectButton}
      </span>
    );
  }

  if (view === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 shrink-0">
        <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-secondary text-muted-foreground text-xs font-medium">
          <Loader2 className="size-3 animate-spin" />
          {t("composio.connecting")}
        </span>
        {reconnectButton}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onConnect}
      className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity duration-200 shrink-0"
    >
      {t("composio.connect")}
      <ExternalLink className="size-3" />
    </button>
  );
}

/**
 * App logo with an initial-letter fallback when the catalog image fails to
 * load (broken/expired logo URL, offline favicon service).
 */
export function AppLogo({ app }: { app: { name: string; logoUrl: string } }) {
  const [imgError, setImgError] = useState(false);
  const initial = app.name.charAt(0).toUpperCase();
  if (imgError) {
    return (
      <span className="size-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <span className="text-xs font-semibold text-muted-foreground">
          {initial}
        </span>
      </span>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt={app.name}
      className="size-8 rounded-lg object-contain shrink-0"
      onError={() => setImgError(true)}
    />
  );
}
