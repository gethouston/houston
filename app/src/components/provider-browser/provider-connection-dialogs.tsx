import { ConfirmDialog } from "@houston-ai/core";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ProviderConnectionDialogProps } from "../../hooks/use-provider-connections";
import {
  closeMeansCancel,
  type ProviderConnectDialogClose,
  type ProviderConnectDialogKind,
} from "../../lib/provider-connect-dialog-close";
import { LocalModelDialog } from "../shell/local-model-dialog";
import { ProviderApiKeyDialog } from "../shell/provider-api-key-dialog";
import { ProviderLoginDialog } from "../shell/provider-login-dialog";

export function ProviderConnectionDialogs({
  confirmSignOutFor,
  onConfirmSignOutOpenChange,
  onConfirmSignOut,
  loginDialog,
  onCloseLoginDialog,
  apiKeyDialog,
  onCloseApiKeyDialog,
  customEndpointDialog,
  onCloseCustomEndpointDialog,
  copilotDialog,
  onLocalConnected,
  onConnectionCancelled,
}: ProviderConnectionDialogProps & {
  onLocalConnected?: (model: string) => void;
  onConnectionCancelled?: () => void;
}) {
  const { t } = useTranslation("providers");
  const apiKeyClose = useRef<ProviderConnectDialogClose>("dismissed");
  const localModelClose = useRef<ProviderConnectDialogClose>("dismissed");

  const settle = (
    kind: ProviderConnectDialogKind,
    reason: ProviderConnectDialogClose,
  ) => {
    if (closeMeansCancel(kind, reason)) onConnectionCancelled?.();
  };

  return (
    <>
      <ConfirmDialog
        open={confirmSignOutFor !== null}
        onOpenChange={onConfirmSignOutOpenChange}
        title={t("signOutConfirm.title", {
          provider: confirmSignOutFor?.name ?? "",
        })}
        description={t("signOutConfirm.description", {
          provider: confirmSignOutFor?.name ?? "",
        })}
        confirmLabel={t("signOutConfirm.confirm")}
        cancelLabel={t("signOutConfirm.cancel")}
        variant="destructive"
        onConfirm={onConfirmSignOut}
      />

      <ProviderLoginDialog
        provider={loginDialog?.provider ?? null}
        url={loginDialog?.url ?? null}
        userCode={loginDialog?.userCode ?? null}
        instructions={loginDialog?.instructions ?? null}
        onClose={() => {
          settle("login", "dismissed");
          onCloseLoginDialog();
        }}
      />

      <ProviderApiKeyDialog
        provider={apiKeyDialog}
        onConnected={() => {
          apiKeyClose.current = "completed";
        }}
        onClose={() => {
          settle("apiKey", apiKeyClose.current);
          apiKeyClose.current = "dismissed";
          onCloseApiKeyDialog();
        }}
      />

      {copilotDialog}

      <LocalModelDialog
        provider={customEndpointDialog}
        onConnected={(model) => {
          localModelClose.current = "completed";
          onLocalConnected?.(model);
        }}
        onClose={() => {
          settle("localModel", localModelClose.current);
          localModelClose.current = "dismissed";
          onCloseCustomEndpointDialog();
        }}
      />
    </>
  );
}
