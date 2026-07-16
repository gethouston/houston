import { CatalogDetailDialog } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { RotateCw, Unplug } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppDisplay } from "./app-display";
import { AppLogo } from "./app-logo";
import { ConnectionStatusBadge } from "./connection-status-badge";

interface AppDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  display: AppDisplay;
  connection: IntegrationConnection;
  onReconnect: () => void;
  onDisconnect: () => void;
  description?: string;
}

/**
 * The per-app detail MODAL for a connected app — the same {@link
 * CatalogDetailDialog} the browse rows open (one detail surface per catalog
 * family, never a slideover): status chip beside the art, the full
 * description, and the Reconnect / Disconnect actions. This is a personal
 * connection surface only — which agents may use an app is managed in one
 * place, the Permissions view, so the dialog carries no per-agent controls.
 */
export function AppDetailDialog({
  open,
  onOpenChange,
  display,
  connection,
  onReconnect,
  onDisconnect,
  description,
}: AppDetailDialogProps) {
  const { t } = useTranslation("integrations");
  return (
    <CatalogDetailDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<AppLogo display={display} size="xl" className="rounded-xl" />}
      title={display.name}
      tags={<ConnectionStatusBadge status={connection.status} />}
      description={description || display.description}
      action={
        <div className="flex w-full gap-2">
          <button
            type="button"
            onClick={onReconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-input px-3 text-sm font-medium text-ink transition-colors hover:bg-chip"
          >
            <RotateCw className="size-4" />
            {t("detail.reconnect")}
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <Unplug className="size-4" />
            {t("detail.disconnect")}
          </button>
        </div>
      }
    />
  );
}
