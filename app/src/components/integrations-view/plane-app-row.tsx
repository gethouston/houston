import { CatalogAddButton, CatalogRow } from "@houston-ai/core";
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
 */
export function PlaneAppRow({
  display,
  onOpen,
  onConnect,
  connecting,
  busy,
}: {
  display: AppDisplay;
  onOpen: () => void;
  onConnect: () => void;
  connecting: boolean;
  busy: boolean;
}) {
  const { t } = useTranslation("integrations");
  return (
    <CatalogRow
      icon={<AppLogo display={display} size="lg" className="rounded-lg" />}
      title={display.name}
      description={display.description}
      onClick={onOpen}
      action={
        <CatalogAddButton
          label={t("home.connectApp", { name: display.name })}
          busy={connecting}
          disabled={busy && !connecting}
          onClick={onConnect}
        />
      }
    />
  );
}
