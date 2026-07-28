import { ConfirmDialog } from "@houston-ai/core";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { accountRowLabel } from "./account-display";
import type { AppDisplay } from "./app-display";

/**
 * The confirm-gated disconnect, shared by both surfaces. A connection is
 * user-level, so disconnecting removes the app for ALL of the user's agents —
 * the copy says so plainly. With `account`, only THAT account of the app is
 * removed (a toolkit can hold several — two Gmail logins) and the copy names
 * it, noting the others stay. No per-agent chips: which agents may use an app
 * is managed in one place (the Permissions view), not surfaced here.
 */
export function IntegrationDisconnectDialog({
  app,
  account,
  onClose,
  onConfirm,
}: {
  /** The app pending disconnect, or null when the dialog is closed. */
  app: AppDisplay | null;
  /** Set = remove only this ONE account of the app (one of several). */
  account?: IntegrationConnection;
  onClose: () => void;
  onConfirm: (toolkit: string, connectionId?: string) => void;
}) {
  const { t, i18n } = useTranslation("integrations");
  const accountName = account
    ? accountRowLabel(account, 0, t, i18n.language)
    : "";

  return (
    <ConfirmDialog
      open={app !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        account
          ? t("accounts.disconnectTitle", { account: accountName })
          : t("grants.disconnect.confirmTitle", { name: app?.name ?? "" })
      }
      description={
        account
          ? t("accounts.disconnectBody", {
              account: accountName,
              name: app?.name ?? "",
            })
          : t("grants.disconnect.confirmBody", { name: app?.name ?? "" })
      }
      confirmLabel={
        account
          ? t("accounts.disconnectAction")
          : t("grants.disconnect.confirmAction")
      }
      cancelLabel={t("connected.disconnect.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (app) onConfirm(app.toolkit, account?.connectionId || undefined);
      }}
    />
  );
}
