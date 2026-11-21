import type { IntegrationToolkit } from "@houston/engine-adapter";
import { Badge, Button, CatalogDetailDialog } from "@houston-ai/core";
import { Plus, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  AppLogo,
  appDisplay,
  type BrokenConnection,
  ConnectionStatusBadge,
  categoryLabel,
} from "../integrations";

export function AppInfoDialog({
  toolkit,
  broken,
  onClose,
  onConnect,
  onRemove,
  busy,
}: {
  toolkit: IntegrationToolkit | null;
  broken?: BrokenConnection;
  onClose: () => void;
  onConnect: (toolkit: string) => void;
  onRemove: (toolkit: string) => void;
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
