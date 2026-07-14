import type { HoustonEvent } from "@houston-ai/core";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import { claimProviderLoginSurface } from "../../components/shell/provider-login-surface";
import { shouldOpenLoginUrlDirectly } from "../../components/shell/provider-login-url";
import { tryBeginCodexLoopbackLogin } from "../../lib/codex-loopback";
import { genericErrorDescription } from "../../lib/error-toast";
import { subscribeHoustonEvents } from "../../lib/events";
import { osIsTauri } from "../../lib/os-bridge";
import { localizedProviderLoginError } from "../../lib/provider-login-error";
import { PROVIDERS, type ProviderInfo } from "../../lib/providers";
import { tauriSystem } from "../../lib/tauri";
import type {
  AddToast,
  ProviderLoginDialogState,
  ProviderPending,
  ProvidersT,
} from "./types";

interface Args {
  visibleProviders: readonly ProviderInfo[];
  addToast: AddToast;
  t: ProvidersT;
  loadStatuses(): Promise<void>;
  patchAuthState(providerId: string, authenticated: boolean): void;
  setLoginDialog: Dispatch<SetStateAction<ProviderLoginDialogState | null>>;
  setPending: Dispatch<SetStateAction<ProviderPending | null>>;
}

/**
 * OAuth URL relay for remote/headless engines (Docker container, VPS). When the
 * engine spawns claude/codex login and the CLI can't open the user's browser, it
 * surfaces the fallback URL via `ProviderLoginUrl`; `ProviderLoginComplete`
 * closes the dialog and refreshes status. Extracted from `provider-settings.tsx`
 * unchanged, including the functional-setState guards that avoid stale-closure
 * reads when several providers fire events concurrently.
 */
export function useProviderLoginEvents({
  visibleProviders,
  addToast,
  t,
  loadStatuses,
  patchAuthState,
  setLoginDialog,
  setPending,
}: Args): void {
  useEffect(() => {
    // This surface owns `ProviderLoginUrl` while mounted — the shell's global
    // fallback stands down so the URL is never opened twice.
    const release = claimProviderLoginSurface();
    const off = subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type === "ProviderLoginUrl") {
        // Resolve the display name from the connect list first so the merged
        // OpenCode account toasts as "OpenCode", not its primary gateway's
        // catalog name; fall back to the full catalog for any non-connect id.
        const prov =
          visibleProviders.find((p) => p.id === ev.data.provider) ??
          PROVIDERS.find((p) => p.id === ev.data.provider);
        // MUST precede the open/dialog decision: for a REMOTE-engine desktop the
        // engine emits a codex URL with no user_code, so shouldOpenLoginUrlDirectly
        // would plainly openUrl — but pi's callback server is in the pod and
        // unreachable. The relay intercepts, binds a LOCAL 1455, and relays the code.
        if (
          tryBeginCodexLoopbackLogin({
            provider: ev.data.provider,
            url: ev.data.url,
            userCode: ev.data.user_code,
          })
        ) {
          return;
        }
        if (
          shouldOpenLoginUrlDirectly({
            isDesktop: osIsTauri(),
            userCode: ev.data.user_code,
            // Claude/Anthropic setup-token: url is docs-only, so never auto-open
            // — fall through to the paste dialog below.
            authCode: ev.data.auth_code,
          })
        ) {
          // Desktop: the runtime is co-located, so a loopback OAuth flow
          // finishes when the user approves in their OWN browser. Open the URL
          // and skip the dialog — there is no code to enter. Surface a failed
          // open so the user isn't left on a silent spinner.
          tauriSystem.openUrl(ev.data.url).catch((err) => {
            addToast({
              title: t("toast.signInFailed", {
                provider: prov?.name ?? ev.data.provider,
              }),
              description: genericErrorDescription(
                "provider_open_login_url",
                err,
              ),
              variant: "error",
            });
          });
          return;
        }
        if (prov) {
          // The relay can emit twice for codex's device flow: URL-only, then
          // again carrying the one-time code. Keep a code we've already shown if
          // a later URL-only frame arrives for the same provider.
          setLoginDialog((current) => ({
            provider: prov,
            url: ev.data.url,
            userCode:
              ev.data.user_code ??
              (current?.provider.id === prov.id ? current.userCode : null),
            instructions: ev.data.instructions,
          }));
        }
      } else if (ev.type === "ProviderLoginComplete") {
        const prov =
          visibleProviders.find((p) => p.id === ev.data.provider) ??
          PROVIDERS.find((p) => p.id === ev.data.provider);
        if (ev.data.success) {
          addToast({
            title: t("toast.signInSucceeded", {
              provider: prov?.name ?? ev.data.provider,
            }),
            variant: "success",
          });
          // Flip the card to connected immediately; loadStatuses reconciles.
          patchAuthState(ev.data.provider, true);
        } else if (ev.data.error) {
          addToast({
            title: t("toast.signInFailed", {
              provider: prov?.name ?? ev.data.provider,
            }),
            description: localizedProviderLoginError(ev.data.error),
            variant: "error",
          });
        }
        // Only clear the dialog if it's showing THIS provider's URL — a
        // completion for a different provider must not clobber an in-flight
        // sign-in.
        setLoginDialog((current) =>
          current?.provider.id === ev.data.provider ? null : current,
        );
        // Same rule for the pending spinner: on failure the status poll never
        // sees authenticated, so without this clear the row would spin forever.
        setPending((current) =>
          current?.id === ev.data.provider ? null : current,
        );
        loadStatuses();
      }
    });
    return () => {
      off();
      release();
    };
  }, [
    visibleProviders,
    addToast,
    t,
    loadStatuses,
    patchAuthState,
    setLoginDialog,
    setPending,
  ]);
}
