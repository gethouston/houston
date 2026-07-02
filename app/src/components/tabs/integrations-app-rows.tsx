import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { Loader2, MoreHorizontal, Plus, RotateCw, Unplug } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Row cards for the Integrations page (the legacy design, rewired to the
 * platform API): a connectable app (whole row is the Connect action, + icon)
 * and a connected app (status dot + always-visible three-dot menu — never
 * hover-gated). Real app names and logos, never machine slugs.
 */

/** Display info resolved from the catalog (slug fallbacks when absent). */
export interface AppDisplay {
  toolkit: string;
  name: string;
  description: string;
  logoUrl: string;
}

export function appDisplay(
  slug: string,
  toolkit: IntegrationToolkit | undefined,
): AppDisplay {
  return {
    toolkit: slug,
    name: toolkit?.name ?? slug,
    description: toolkit?.description ?? "",
    logoUrl: toolkit?.logoUrl || fallbackLogo(slug),
  };
}

export function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}

function Logo({ app }: { app: AppDisplay }) {
  const [imgError, setImgError] = useState(false);
  if (imgError) {
    return (
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background">
        <span className="text-xs font-semibold text-muted-foreground">
          {app.name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt={app.name}
      className="size-8 shrink-0 rounded-lg bg-background object-contain"
      onError={() => setImgError(true)}
    />
  );
}

/** A connectable app in the browse grid. */
export function BrowseAppRow({
  app,
  connecting,
  onConnect,
}: {
  app: AppDisplay;
  connecting: boolean;
  onConnect: () => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={connecting}
      title={t("browse.connectTitle", { name: app.name })}
      className="group flex w-full items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-black/[0.05] focus-visible:bg-black/[0.05] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
    >
      <Logo app={app} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-foreground">
          {app.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {app.description}
        </p>
      </div>
      {connecting ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Plus className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
      )}
    </button>
  );
}

/** An app the user connected: status dot/spinner + Reconnect/Disconnect menu. */
export function ConnectedAppRow({
  app,
  status,
  busy,
  onReconnect,
  onDisconnect,
}: {
  app: AppDisplay;
  status: IntegrationConnection["status"];
  /** A disconnect is in flight for this row. */
  busy: boolean;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 transition-colors hover:bg-black/[0.05]">
      <Logo app={app} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
          {app.name}
          {status === "active" ? (
            <span
              role="img"
              className="size-1.5 shrink-0 rounded-full bg-emerald-500"
              aria-label={t("connected.dotAria")}
            />
          ) : status === "pending" ? (
            <Loader2
              className="size-3 shrink-0 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : (
            <span
              role="img"
              className="size-1.5 shrink-0 rounded-full bg-destructive"
              aria-label={t("connected.statusError")}
            />
          )}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {status === "pending"
            ? t("connected.statusPending")
            : status === "error"
              ? t("connected.statusError")
              : app.description || t("connected.dotAria")}
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label={t("connected.menu.aria", { name: app.name })}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-black/[0.06] hover:text-foreground focus-visible:bg-black/[0.06] focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onReconnect}>
            <RotateCw className="size-3.5" />
            {t("connected.menu.reconnect")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDisconnect} variant="destructive">
            <Unplug className="size-3.5" />
            {t("connected.menu.disconnect")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
