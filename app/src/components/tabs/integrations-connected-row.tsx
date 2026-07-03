import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { Loader2, MoreHorizontal, RotateCw, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type AppDisplay, Logo } from "./integrations-app-display";
import {
  GrantToggle,
  StatusDot,
  statusSubtitle,
} from "./integrations-app-rows";

/**
 * The two "connected app" cards. `ConnectedAppRow` is the full card (status +
 * always-visible Reconnect / Disconnect menu, never hover-gated) used in both
 * single-player and the multiplayer "This agent can use" section, where it also
 * carries a grant toggle (revoke) and the "Disconnect everywhere" label (C4).
 * `AvailableAppRow` is the multiplayer "Your other connected apps" card: the
 * only action is a single "Allow for this agent" grant toggle (no OAuth).
 */

/**
 * An app the user connected: logo + name + live status dot, then an optional
 * grant toggle (multiplayer), then the always-visible Reconnect / Disconnect
 * menu. `disconnectLabel` lets multiplayer say "Disconnect everywhere" (C4).
 */
export function ConnectedAppRow({
  app,
  status,
  busy,
  grant,
  onReconnect,
  onDisconnect,
  disconnectLabel,
}: {
  app: AppDisplay;
  status: IntegrationConnection["status"];
  /** A disconnect is in flight for this row. */
  busy: boolean;
  /** Multiplayer: an ON grant toggle (revokes on click). Omitted single-player. */
  grant?: { pending: boolean; onToggle: () => void };
  onReconnect: () => void;
  onDisconnect: () => void;
  disconnectLabel?: string;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 transition-colors hover:bg-black/[0.05]">
      <Logo app={app} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
          {app.name}
          <StatusDot status={status} />
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {statusSubtitle(app, status, t)}
        </p>
      </div>

      {grant && (
        <GrantToggle
          on
          pending={grant.pending}
          label={t("grants.granted.revoke", { name: app.name })}
          onToggle={grant.onToggle}
        />
      )}

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
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onReconnect}>
            <RotateCw className="size-3.5" />
            {t("connected.menu.reconnect")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDisconnect} variant="destructive">
            <Unplug className="size-3.5" />
            {disconnectLabel ?? t("connected.menu.disconnect")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * A connected-but-ungranted app (multiplayer "Your other connected apps"): the
 * same card, but the action is a single "Allow for this agent" grant toggle
 * (OFF → ON, instant PUT). No OAuth, no disconnect here.
 */
export function AvailableAppRow({
  app,
  status,
  pending,
  onAllow,
}: {
  app: AppDisplay;
  status: IntegrationConnection["status"];
  /** A grant PUT is in flight for this row. */
  pending: boolean;
  onAllow: () => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 transition-colors hover:bg-black/[0.05]">
      <Logo app={app} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
          {app.name}
          <StatusDot status={status} />
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {statusSubtitle(app, status, t)}
        </p>
      </div>
      <GrantToggle
        on={false}
        pending={pending}
        label={t("grants.available.allow", { name: app.name })}
        onToggle={onAllow}
      />
    </div>
  );
}
