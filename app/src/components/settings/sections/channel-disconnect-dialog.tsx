import { ConfirmDialog } from "@houston-ai/core";
import type {
  ChannelConnection,
  ChannelProvider,
  ChannelProviderId,
} from "@houston/engine-adapter";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

/**
 * Confirm removing one connection, naming the provider it belongs to. A
 * confirmed removal takes the row's button with it, so focus goes to the
 * provider's card instead of falling to the page.
 */
export function ChannelDisconnectDialog({
  target,
  providers,
  onClose,
  onConfirm,
  onFocusCard,
}: {
  target: ChannelConnection | null;
  providers: readonly ChannelProvider[];
  onClose: () => void;
  onConfirm: (connection: ChannelConnection) => void;
  onFocusCard: (provider: ChannelProviderId) => void;
}) {
  const { t } = useTranslation("settings");
  const removedFrom = useRef<ChannelProviderId | null>(null);
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
        if (!target) return;
        removedFrom.current = target.provider;
        onConfirm(target);
      }}
      onCloseAutoFocus={(event) => {
        const provider = removedFrom.current;
        removedFrom.current = null;
        if (!provider) return;
        event.preventDefault();
        onFocusCard(provider);
      }}
    />
  );
}
