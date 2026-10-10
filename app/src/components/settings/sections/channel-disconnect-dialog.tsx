import type {
  ChannelConnection,
  ChannelProvider,
} from "@houston/engine-adapter";
import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/** Confirm removing one connection, naming the provider it belongs to. */
export function ChannelDisconnectDialog({
  target,
  providers,
  onClose,
  onConfirm,
}: {
  target: ChannelConnection | null;
  providers: readonly ChannelProvider[];
  onClose: () => void;
  onConfirm: (connection: ChannelConnection) => void;
}) {
  const { t } = useTranslation("settings");
  const provider =
    providers.find((item) => item.id === target?.provider)?.name ?? "";
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("channels.disconnectTitle", { provider })}
      description={t("channels.disconnectDescription", {
        name: target?.accountLabel ?? "",
        provider,
      })}
      confirmLabel={t("channels.disconnect")}
      cancelLabel={t("channels.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (target) onConfirm(target);
      }}
    />
  );
}
