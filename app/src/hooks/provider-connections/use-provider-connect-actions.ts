import { type Dispatch, type SetStateAction, useCallback } from "react";
import { genericErrorDescription } from "../../lib/error-toast";
import type { ProviderInfo } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import type {
  AddToast,
  ProviderLoginDialogState,
  ProviderPending,
  ProvidersT,
} from "./types";

/** Open the copilot Personal-vs-Company dialog; see `useCopilotConnect`. */
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
  /** Start a connect. Branches on `p.auth` / `copilotConnect` (may open a dialog). */
  connect(provider: ProviderInfo): void;
  /** Abort an in-flight sign-in so the engine slot frees up for a retry. */
  cancel(provider: ProviderInfo): Promise<void>;
  /** Run the confirmed sign-out (called from the confirm dialog's onConfirm). */
  signOutConfirmed(provider: ProviderInfo): Promise<void>;
}

/**
 * The connect / cancel / sign-out actions for the provider-connections layer,
 * extracted from `provider-settings.tsx`. Each renders its own provider-specific
 * failure toast (`toast: false` on the engine call so the message doesn't show
 * twice) and reconciles the optimistic card state with `loadStatuses`.
 */
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
  // `enterpriseDomain` is set only for GitHub Copilot Enterprise (collected by
  // the copilot dialog).
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
        addToast({
          title: t("toast.signInFailed", { provider: provider.name }),
          description: genericErrorDescription("provider_sign_in", err),
          variant: "error",
        });
        setPending(null);
      }
    },
    [addToast, t, setPending],
  );

  const connect = useCallback(
    (provider: ProviderInfo) => {
      // API-key providers (OpenCode / OpenRouter / …) connect by pasting a key.
      if (provider.auth === "apiKey") {
        setApiKeyDialog(provider);
        return;
      }
      // OpenAI-compatible (local) servers connect by base URL + model.
      if (provider.auth === "openaiCompatible") {
        setCustomEndpointDialog(provider);
        return;
      }
      // GitHub Copilot: choose Personal vs Company first; the chosen plan
      // resumes the login with the right domain (Company) or none (Personal).
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
      // Abort the engine-side login subprocess so the slot frees up and a retry
      // isn't rejected as "already pending". The engine's benign
      // ProviderLoginComplete (handled by the events hook) is the backstop.
      try {
        await tauriProvider.cancelLogin(provider.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[use-provider-connections] cancelLogin(${provider.id}) failed:`,
          msg,
        );
        addToast({
          title: t("toast.cancelFailed", { provider: provider.name }),
          description: genericErrorDescription("provider_cancel_login", err),
          variant: "error",
        });
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
        // Flip the card to disconnected now rather than blocking on the
        // several-second re-probe; loadStatuses reconciles in the background.
        patchAuthState(provider.id, false);
        void loadStatuses();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[use-provider-connections] launchLogout(${provider.id}) failed:`,
          msg,
        );
        addToast({
          title: t("toast.signOutFailed", { provider: provider.name }),
          description: genericErrorDescription("provider_sign_out", err),
          variant: "error",
        });
      } finally {
        setPending(null);
      }
    },
    [addToast, t, loadStatuses, patchAuthState, setPending],
  );

  return { connect, cancel, signOutConfirmed };
}
