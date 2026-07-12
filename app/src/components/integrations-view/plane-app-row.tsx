import { CatalogRow, Spinner } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { type AppDisplay, AppLogo } from "../integrations";

/**
 * One flat category row on the browse plane — the integrations flavor of the
 * shared {@link CatalogRow}: brand art via {@link AppLogo}, the app's name +
 * one-line description, and a quiet trailing `+` that becomes a spinner while
 * THIS app connects. While ANOTHER connect is in flight the row goes inert-but-
 * calm (CatalogRow's `inert`), never greyed out.
 */
export function PlaneAppRow({
  display,
  onConnect,
  connecting,
  busy,
}: {
  display: AppDisplay;
  onConnect: () => void;
  connecting: boolean;
  busy: boolean;
}) {
  return (
    <CatalogRow
      icon={<AppLogo display={display} size="lg" className="rounded-lg" />}
      title={display.name}
      description={display.description}
      trailing={
        connecting ? (
          <Spinner className="size-4 text-ink-muted" />
        ) : (
          <Plus className="size-4 shrink-0 text-ink-muted/70" aria-hidden />
        )
      }
      onClick={onConnect}
      inert={busy && !connecting}
    />
  );
}
