import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { AppDisplay } from "./integrations-app-display";

/**
 * The confirm-gated disconnect, shared by the single-player connected list and
 * the multiplayer grant view. Same dialog, different stakes — the copy scope
 * says which: `agent` (this removes the app for your agent) vs `everywhere`
 * (multiplayer: the connection is user-level, so it disappears for ALL agents).
 */
export function IntegrationDisconnectDialog({
  app,
  scope,
  onClose,
  onConfirm,
}: {
  /** The app pending disconnect, or null when the dialog is closed. */
  app: AppDisplay | null;
  scope: "agent" | "everywhere";
  onClose: () => void;
  onConfirm: (toolkit: string) => void;
}) {
  const { t } = useTranslation("integrations");
  const keys =
    scope === "everywhere"
      ? ({
          title: "grants.disconnect.confirmTitle",
          body: "grants.disconnect.confirmBody",
          action: "grants.disconnect.confirmAction",
        } as const)
      : ({
          title: "connected.disconnect.confirmTitle",
          body: "connected.disconnect.confirmBody",
          action: "connected.disconnect.confirmAction",
        } as const);

  return (
    <ConfirmDialog
      open={app !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t(keys.title, { name: app?.name ?? "" })}
      description={t(keys.body, { name: app?.name ?? "" })}
      confirmLabel={t(keys.action)}
      cancelLabel={t("connected.disconnect.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (app) onConfirm(app.toolkit);
      }}
    />
  );
}
