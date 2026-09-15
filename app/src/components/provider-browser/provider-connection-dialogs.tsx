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

/**
 * The complete provider-connect dialog stack for the AI models hub, rendered
 * ONCE by the hub view. Presentational: it reuses the existing shell dialog
 * components (api key, copilot plan, remote login-url / paste-code,
 * openai-compatible, sign-out confirm) and is driven entirely by
 * `connections.dialogProps` from `useProviderConnections`. The copilot dialog is
 * passed through as an already-built element (it owns its own plan state, and
 * its own `closeMeansCancel` call, via `useCopilotConnect`).
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
  onLocalConnected,
  onConnectionCancelled,
}: ProviderConnectionDialogProps & {
  /**
   * Receives the user-typed model id when the local (OpenAI-compatible)
   * endpoint dialog connects. That model exists nowhere in the catalog or the
   * patched status snapshot, so auto-advance flows (onboarding) must take it
   * from the dialog itself; browse surfaces (the hub) omit this.
   */
  onLocalConnected?: (model: string) => void;
  onConnectionCancelled?: () => void;
}) {
  const { t } = useTranslation("providers");
  // A dialog reports success through `onConnected` and only THEN closes, but
  // its `onClose` carries no reason of its own — these hold the pending reason
  // across that hop. Reset on every close so a reopened dialog starts from
  // "dismissed" again.
  const apiKeyClose = useRef<ProviderConnectDialogClose>("dismissed");
  const localModelClose = useRef<ProviderConnectDialogClose>("dismissed");

  /** Cancel the connection observation only for a close that means abandon. */
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
          // The sign-in finishes out of band and unmounts this dialog, so a
          // close the USER drove is always an abandon.
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
