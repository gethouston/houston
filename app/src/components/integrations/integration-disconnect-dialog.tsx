import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { AppDisplay } from "./app-display";

/**
 * The confirm-gated disconnect, shared by both surfaces. A connection is
 * user-level, so disconnecting removes the app for ALL of the user's agents —
 * the copy says so plainly. No per-agent chips: which agents may use an app is
 * managed in one place (the Permissions view), not surfaced here.
 */
export function IntegrationDisconnectDialog({
  app,
  onClose,
  onConfirm,
}: {
  /** The app pending disconnect, or null when the dialog is closed. */
  app: AppDisplay | null;
  onClose: () => void;
  onConfirm: (toolkit: string) => void;
}) {
  const { t } = useTranslation("integrations");

  return (
    <ConfirmDialog
      open={app !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("grants.disconnect.confirmTitle", { name: app?.name ?? "" })}
      description={t("grants.disconnect.confirmBody", {
        name: app?.name ?? "",
      })}
      confirmLabel={t("grants.disconnect.confirmAction")}
      cancelLabel={t("connected.disconnect.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (app) onConfirm(app.toolkit);
      }}
    />
  );
}
