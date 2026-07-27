import { Badge, Button, CatalogDetailDialog } from "@houston-ai/core";
import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { Plus, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AppLogo,
  appDisplay,
  type BrokenConnection,
  ConnectionStatusBadge,
  categoryLabel,
} from "../integrations";

/**
 * The catalog app's modal — a row-body click opens it: brand art, name, the
 * app's category chips, its FULL description (the row truncates to one line),
 * and the connect CTA. `toolkit === null` keeps it closed. Connecting from here
 * closes the modal and hands off to the surface's one connect flow (the row's
 * inline card takes over, same as its `+`).
 *
 * `broken` = this app holds a connection that never went active, so the same
 * modal is where that connection is dealt with: it wears the status chip beside
 * the categories, says what happened, and its footer offers the two ways out —
 * Finish connecting / Reconnect (the same hand-off, from the row the user
 * opened) and Remove, which disconnects the half-made connection. There is no
 * second dialog for a broken app: a catalog row opens the catalog's modal,
 * whatever state its app is in.
 */
export function AppInfoDialog({
  toolkit,
  broken,
  onClose,
  onConnect,
  onRemove,
  busy,
}: {
  toolkit: IntegrationToolkit | null;
  /** This app's pending / errored connection, when it has one. */
  broken?: BrokenConnection;
  onClose: () => void;
  onConnect: (toolkit: string) => void;
  /** Disconnect a broken connection (never shown for a plain catalog app). */
  onRemove: (toolkit: string) => void;
  /** THIS app's own hand-off is already running (the user started it from its
   *  row, or from another surface) — the CTA disables rather than double-firing.
   *  Never gated on some other app's connect: flows are per toolkit. */
  busy: boolean;
}) {
  const { t } = useTranslation("integrations");
  if (!toolkit) return null;
  const display = appDisplay(toolkit.slug, toolkit);
  const copy = broken
    ? broken.status === "error"
      ? {
          body: t("errorRecovery.body", { app: display.name }),
          connect: t("errorRecovery.reconnect"),
          remove: t("errorRecovery.remove"),
        }
      : {
          body: t("pendingRecovery.body", { app: display.name }),
          connect: t("pendingRecovery.finish"),
          remove: t("pendingRecovery.remove"),
        }
    : null;

  return (
    <CatalogDetailDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      icon={<AppLogo display={display} size="xl" className="rounded-xl" />}
      title={display.name}
      tags={
        <>
          {broken && <ConnectionStatusBadge status={broken.status} />}
          {(toolkit.categories ?? []).map((category) => (
            <Badge key={category} variant="secondary">
              {categoryLabel(category)}
            </Badge>
          ))}
        </>
      }
      // A broken app's modal leads with its situation, not its blurb: the user
      // opened it because the connect did not land, and the status chip above
      // already names the app.
      description={copy ? copy.body : display.description}
      action={
        copy ? (
          <div className="flex w-full gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => onConnect(toolkit.slug)}
              className="flex-1 gap-1.5"
            >
              <RotateCw className="size-4" />
              {copy.connect}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onRemove(toolkit.slug)}
              className="flex-1 text-danger hover:bg-danger/10 hover:text-danger"
            >
              {copy.remove}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            disabled={busy}
            onClick={() => onConnect(toolkit.slug)}
            className="gap-1.5"
          >
            <Plus className="size-4" />
            {t("home.connect")}
          </Button>
        )
      }
    />
  );
}
