import { CatalogAddButton, CatalogRow } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type AppDisplay, AppLogo } from "../integrations";

/**
 * One flat category row on the browse plane — the integrations flavor of the
 * shared {@link CatalogRow}: brand art via {@link AppLogo}, the app's name +
 * one-line description, and the filled `+` install button at the right edge.
 * The row BODY opens the app's "more info" modal (`onOpen`); only the `+`
 * connects. While THIS app connects the `+` spins; while ANOTHER connect is
 * in flight it disables (the body stays clickable — reading about an app is
 * always safe).
 *
 * A `ready` row (a no-auth app: web search, weather…) has NOTHING to connect —
 * its tools work as-is — so the `+` is replaced by a quiet non-interactive
 * ready badge and the body still opens the info modal.
 */
export function PlaneAppRow({
  display,
  onOpen,
  onConnect,
  connecting,
  busy,
  ready = false,
}: {
  display: AppDisplay;
  onOpen: () => void;
  onConnect: () => void;
  connecting: boolean;
  busy: boolean;
  ready?: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <CatalogRow
      icon={<AppLogo display={display} size="lg" className="rounded-lg" />}
      title={display.name}
      description={display.description}
      onClick={onOpen}
      trailing={ready ? <ReadyBadge /> : undefined}
      action={
        ready ? undefined : (
          <CatalogAddButton
            label={t("home.connectApp", { name: display.name })}
            busy={connecting}
            disabled={busy && !connecting}
            onClick={onConnect}
          />
        )
      }
    />
  );
}

/** The quiet "no connection needed" marker on a ready row — informational,
 *  never a button (there is no connect to trigger). */
export function ReadyBadge() {
  const { t } = useTranslation("integrations");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-hover px-2.5 py-1 text-xs font-medium text-ink-muted">
      <Check className="size-3.5" aria-hidden />
      {t("home.readyBadge")}
    </span>
  );
}
