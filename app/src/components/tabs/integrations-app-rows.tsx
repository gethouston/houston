import { Switch } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type AppDisplay, Logo } from "./integrations-app-display";

/**
 * Shared row primitives for the Integrations page: the connectable browse card
 * (whole row is the Connect action, + icon), the live status dot / subtitle for
 * a connected app, and the grant pill toggle (multiplayer). The full connected
 * cards live in `integrations-connected-row`; the display primitives (logo,
 * name/description resolution) in `integrations-app-display`.
 */

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
      className="group flex w-full items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.05] focus-visible:bg-foreground/[0.05] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
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

/** The live status dot / spinner shown next to a connected app's name. */
export function StatusDot({
  status,
}: {
  status: IntegrationConnection["status"];
}) {
  const { t } = useTranslation("integrations");
  if (status === "active") {
    return (
      <span
        role="img"
        className="size-1.5 shrink-0 rounded-full bg-emerald-500"
        aria-label={t("connected.dotAria")}
      />
    );
  }
  if (status === "pending") {
    return (
      <Loader2
        className="size-3 shrink-0 animate-spin text-muted-foreground"
        aria-hidden
      />
    );
  }
  return (
    <span
      role="img"
      className="size-1.5 shrink-0 rounded-full bg-destructive"
      aria-label={t("connected.statusError")}
    />
  );
}

export function statusSubtitle(
  app: AppDisplay,
  status: IntegrationConnection["status"],
  t: ReturnType<typeof useTranslation<"integrations">>["t"],
): string {
  if (status === "pending") return t("connected.statusPending");
  if (status === "error") return t("connected.statusError");
  return app.description || t("connected.dotAria");
}

/**
 * The grant control (design-system `Switch`): ON = granted (flip = revoke),
 * OFF = ungranted (flip = allow). A spinner sits beside it while the replace-set
 * PUT is in flight, and the switch is disabled so the user can't double-fire.
 */
export function GrantToggle({
  on,
  pending,
  label,
  onToggle,
}: {
  on: boolean;
  pending: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {pending && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      )}
      <Switch
        checked={on}
        disabled={pending}
        aria-label={label}
        onCheckedChange={onToggle}
      />
    </div>
  );
}
