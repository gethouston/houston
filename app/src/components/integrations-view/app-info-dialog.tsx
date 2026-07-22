import { Badge, Button, CatalogDetailDialog } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppLogo, appDisplay, categoryLabel } from "../integrations";

/**
 * The browse plane's "more info" modal — a row-body click opens it: brand art,
 * name, the app's category chips, its FULL description (the row truncates to
 * one line), and the Connect CTA. `toolkit === null` keeps it closed.
 * Connecting from here closes the modal and hands off to the page's one
 * connect flow (the inline waiting panel takes over, same as a row's `+`).
 */
export function AppInfoDialog({
  toolkit,
  onClose,
  onConnect,
  busy,
}: {
  toolkit: IntegrationToolkit | null;
  onClose: () => void;
  onConnect: (toolkit: string) => void;
  /** ANY connect is in flight — the CTA disables rather than double-firing. */
  busy: boolean;
}) {
  const { t } = useTranslation("integrations");
  if (!toolkit) return null;
  const display = appDisplay(toolkit.slug, toolkit);

  return (
    <CatalogDetailDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      icon={<AppLogo display={display} size="xl" className="rounded-xl" />}
      title={display.name}
      tags={(toolkit.categories ?? []).map((category) => (
        <Badge key={category} variant="secondary">
          {categoryLabel(category)}
        </Badge>
      ))}
      description={display.description}
      action={
        <Button
          type="button"
          disabled={busy}
          onClick={() => onConnect(toolkit.slug)}
          className="gap-1.5"
        >
          <Plus className="size-4" />
          {t("home.connect")}
        </Button>
      }
    />
  );
}
