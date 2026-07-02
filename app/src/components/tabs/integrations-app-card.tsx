import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Row cards for the Integrations tab: a connectable app (logo + name +
 * description + always-visible Connect) and a connected app (logo + name +
 * live status + actions). Non-technical voice: real app names, never slugs.
 */

const pill =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 h-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

/** App logo with a lettered fallback when the image is missing or 404s. */
export function AppLogo({ name, logoUrl }: { name: string; logoUrl?: string }) {
  const [broken, setBroken] = useState(false);
  if (!logoUrl || broken) {
    return (
      <div
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm font-medium text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={logoUrl}
      alt=""
      className="size-8 shrink-0 rounded-lg object-contain"
      onError={() => setBroken(true)}
    />
  );
}

/** A connectable app from the catalog. */
export function AvailableAppRow({
  toolkit,
  connecting,
  disabled,
  onConnect,
}: {
  toolkit: IntegrationToolkit;
  /** This app's OAuth is in flight (browser open). */
  connecting: boolean;
  /** Another app's connect is in flight — hold this row's button. */
  disabled: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation("agents");
  return (
    <li className="flex items-center gap-3 rounded-xl border border-black/5 bg-card px-3 py-2.5">
      <AppLogo name={toolkit.name} logoUrl={toolkit.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{toolkit.name}</p>
        {toolkit.description && (
          <p className="truncate text-xs text-muted-foreground">
            {toolkit.description}
          </p>
        )}
      </div>
      {connecting ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className="size-3 animate-spin" />
          {t("integrations.finishInBrowser")}
        </span>
      ) : (
        <button
          type="button"
          className={pill}
          onClick={onConnect}
          disabled={disabled}
        >
          {t("integrations.connect")}
        </button>
      )}
    </li>
  );
}

/** An app the user already connected (or is finishing / needs to redo). */
export function ConnectedAppRow({
  connection,
  toolkit,
  onReconnect,
  onDisconnect,
  disconnecting,
}: {
  connection: IntegrationConnection;
  /** Catalog entry for the pretty name + logo; absent → slug fallback. */
  toolkit?: IntegrationToolkit;
  onReconnect: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const { t } = useTranslation("agents");
  const name = toolkit?.name ?? connection.toolkit;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-black/5 bg-card px-3 py-2.5">
      <AppLogo name={name} logoUrl={toolkit?.logoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {connection.status === "active" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-green-600" aria-hidden />
            {t("integrations.statusConnected")}
          </p>
        ) : connection.status === "pending" ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw className="size-3 animate-spin" aria-hidden />
            {t("integrations.finishInBrowser")}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-1.5 rounded-full bg-destructive"
              aria-hidden
            />
            {t("integrations.statusError")}
          </p>
        )}
      </div>
      {connection.status === "error" && (
        <button type="button" className={pill} onClick={onReconnect}>
          {t("integrations.reconnect")}
        </button>
      )}
      <button
        type="button"
        className="shrink-0 text-xs text-muted-foreground hover:text-destructive hover:underline disabled:opacity-50"
        onClick={onDisconnect}
        disabled={disconnecting}
      >
        {t("integrations.disconnect")}
      </button>
    </li>
  );
}
