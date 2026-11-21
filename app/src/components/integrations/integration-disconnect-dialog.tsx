import type { IntegrationConnection } from "@houston/engine-adapter";
import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { accountRowLabel } from "./account-display";
import type { AppDisplay } from "./app-display";

export function IntegrationDisconnectDialog({
  app,
  account,
  onClose,
  onConfirm,
}: {
  app: AppDisplay | null;
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
