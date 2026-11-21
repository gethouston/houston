import { type Dispatch, type SetStateAction, useCallback } from "react";
import { genericErrorDescription } from "../../lib/error-report";
import { isNetworkTransportError } from "../../lib/network-transport-error";
import { isOrgAdminRequiredError } from "../../lib/org-admin-required-error";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import type {
  AddToast,
  ProviderLoginDialogState,
  ProviderPending,
  ProvidersT,
} from "./types";

type BeginCopilot = (
  provider: ProviderInfo,
  run: (enterpriseDomain?: string) => void,
) => boolean;

interface Args {
  addToast: AddToast;
  t: ProvidersT;
  loadStatuses(): Promise<void>;
  patchAuthState(providerId: string, authenticated: boolean): void;
  beginCopilot: BeginCopilot;
  setPending: Dispatch<SetStateAction<ProviderPending | null>>;
  setLoginDialog: Dispatch<SetStateAction<ProviderLoginDialogState | null>>;
  setApiKeyDialog: Dispatch<SetStateAction<ProviderInfo | null>>;
  setCustomEndpointDialog: Dispatch<SetStateAction<ProviderInfo | null>>;
}

export interface ProviderConnectActions {
  connect(provider: ProviderInfo): void;
  cancel(provider: ProviderInfo): Promise<void>;
  signOutConfirmed(provider: ProviderInfo): Promise<void>;
}

export function useProviderConnectActions({
  addToast,
  t,
  loadStatuses,
  patchAuthState,
  beginCopilot,
  setPending,
  setLoginDialog,
  setApiKeyDialog,
  setCustomEndpointDialog,
}: Args): ProviderConnectActions {
  const startOAuthLogin = useCallback(
    async (provider: ProviderInfo, enterpriseDomain?: string) => {
      setPending({ id: provider.id, mode: "connecting" });
      try {
        await tauriProvider.launchLogin(provider.id, {
          toast: false,
          enterpriseDomain,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[use-provider-connections] launchLogin(${provider.id}) failed:`,
          msg,
        );
        if (!isNetworkTransportError(err) && !isOrgAdminRequiredError(err)) {
          addToast({
            title: t("toast.signInFailed", { provider: provider.name }),
            description: genericErrorDescription("provider_sign_in", err),
            variant: "error",
          });
        }
        setPending(null);
      }
    },
    [addToast, t, setPending],
  );

  const connect = useCallback(
    (provider: ProviderInfo) => {
      if (provider.auth === "apiKey") {
        setApiKeyDialog(provider);
        return;
      }
      if (provider.auth === "openaiCompatible") {
        setCustomEndpointDialog(provider);
        return;
      }
      if (
        beginCopilot(
          provider,
          (domain) => void startOAuthLogin(provider, domain),
        )
      ) {
        return;
      }
      void startOAuthLogin(provider);
    },
    [beginCopilot, startOAuthLogin, setApiKeyDialog, setCustomEndpointDialog],
  );

  const cancel = useCallback(
    async (provider: ProviderInfo) => {
      try {
        await tauriProvider.cancelLogin(provider.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[use-provider-connections] cancelLogin(${provider.id}) failed:`,
          msg,
        );
        if (!isNetworkTransportError(err)) {
          addToast({
            title: t("toast.cancelFailed", { provider: provider.name }),
            description: genericErrorDescription("provider_cancel_login", err),
            variant: "error",
          });
        }
      } finally {
        setPending((current) => (current?.id === provider.id ? null : current));
        setLoginDialog((current) =>
          current?.provider.id === provider.id ? null : current,
        );
      }
    },
    [addToast, t, setPending, setLoginDialog],
  );

  const signOutConfirmed = useCallback(
    async (provider: ProviderInfo) => {
      setPending({ id: provider.id, mode: "signingOut" });
      try {
        await tauriProvider.launchLogout(provider.id);
        patchAuthState(provider.id, false);
        void loadStatuses();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[use-provider-connections] launchLogout(${provider.id}) failed:`,
          msg,
        );
        if (!isNetworkTransportError(err)) {
          addToast({
            title: t("toast.signOutFailed", { provider: provider.name }),
            description: genericErrorDescription("provider_sign_out", err),
            variant: "error",
          });
        }
      } finally {
        setPending(null);
      }
    },
    [addToast, t, loadStatuses, patchAuthState, setPending],
  );

  return { connect, cancel, signOutConfirmed };
}
