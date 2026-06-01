import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Unplug,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";

export interface ConnectedAppInfo {
  toolkit: string;
  name: string;
  description: string;
  logoUrl: string;
}

/** Which per-card action is in flight, if any. */
export type CardBusy = "reconnecting" | "disconnecting" | null;

interface ConnectedAppCardProps {
  app: ConnectedAppInfo;
  busy: CardBusy;
  onManage: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

/**
 * A connected integration row. The main area opens the app's Composio page
 * ("manage"); the always-visible three-dot menu exposes Reconnect (refresh
 * auth) and Disconnect (remove). The trigger is never hover-gated.
 */
export function ConnectedAppCard({
  app,
  busy,
  onManage,
  onReconnect,
  onDisconnect,
}: ConnectedAppCardProps) {
  const { t } = useTranslation("integrations");
  const [imgError, setImgError] = useState(false);
  const initial = app.name.charAt(0).toUpperCase();
  const isBusy = busy !== null;

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary hover:bg-black/[0.05] transition-colors">
      <button
        type="button"
        onClick={onManage}
        title={t("connected.manageOn", { name: app.name })}
        className="flex flex-1 min-w-0 items-center gap-3 text-left rounded-lg focus-visible:outline-none focus-visible:bg-black/[0.05]"
      >
        {!imgError ? (
          <img
            src={app.logoUrl}
            alt={app.name}
            className="size-8 rounded-lg object-contain shrink-0 bg-background"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="size-8 rounded-lg bg-background flex items-center justify-center shrink-0">
            <span className="text-xs font-semibold text-muted-foreground">
              {initial}
            </span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate flex items-center gap-1.5">
            {app.name}
            <span
              className="size-1.5 rounded-full bg-emerald-500 shrink-0"
              aria-label={t("connected.dotAria")}
            />
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {app.description}
          </p>
        </div>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isBusy}
            aria-label={t("connected.menu.aria", { name: app.name })}
            className="shrink-0 inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground/70 hover:text-foreground hover:bg-black/[0.06] focus-visible:outline-none focus-visible:bg-black/[0.06] disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {isBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-4" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onManage}>
            <ExternalLink className="size-3.5" />
            {t("connected.menu.manage")}
          </DropdownMenuItem>
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
