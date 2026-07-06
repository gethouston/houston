import { ConfirmDialog } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { ProviderConnectionDialogProps } from "../../hooks/use-provider-connections";
import { OpenAiCompatibleDialog } from "../shell/openai-compatible-dialog";
import { ProviderApiKeyDialog } from "../shell/provider-api-key-dialog";
import { ProviderLoginDialog } from "../shell/provider-login-dialog";

/**
 * The complete provider-connect dialog stack for the AI models hub, rendered
 * ONCE by the hub view. Presentational: it reuses the existing shell dialog
 * components (api key, copilot plan, remote login-url / paste-code,
 * openai-compatible, sign-out confirm) and is driven entirely by
 * `connections.dialogProps` from `useProviderConnections`. The copilot dialog is
 * passed through as an already-built element (it owns its own plan state via
 * `useCopilotConnect`).
 */
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
}: ProviderConnectionDialogProps) {
  const { t } = useTranslation("providers");

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
        onClose={onCloseLoginDialog}
      />

      <ProviderApiKeyDialog
        provider={apiKeyDialog}
        onClose={onCloseApiKeyDialog}
      />

      {copilotDialog}

      <OpenAiCompatibleDialog
        provider={customEndpointDialog}
        onClose={onCloseCustomEndpointDialog}
      />
    </>
  );
}
