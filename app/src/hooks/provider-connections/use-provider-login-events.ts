import type { HoustonEvent } from "@houston-ai/core";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import { claimProviderLoginSurface } from "../../components/shell/provider-login-surface";
import { shouldOpenLoginUrlDirectly } from "../../components/shell/provider-login-url";
import { tryBeginCodexLoopbackLogin } from "../../lib/codex-loopback";
import { subscribeHoustonEvents } from "../../lib/events";
import { osIsTauri } from "../../lib/os-bridge";
import { localizedProviderLoginError } from "../../lib/provider-login-error";
import { getProvider, type ProviderInfo } from "../../lib/providers";
import { tauriSystem } from "../../lib/tauri";
import type {
  AddToast,
  ProviderLoginDialogState,
  ProviderPending,
  ProvidersT,
} from "./types";

interface Args {
  active: boolean;
  visibleProviders: readonly ProviderInfo[];
  addToast: AddToast;
  t: ProvidersT;
  loadStatuses(): Promise<void>;
  patchAuthState(providerId: string, authenticated: boolean): void;
  setLoginDialog: Dispatch<SetStateAction<ProviderLoginDialogState | null>>;
  setPending: Dispatch<SetStateAction<ProviderPending | null>>;
}

function eventProvider(
  visibleProviders: readonly ProviderInfo[],
  eventId: string,
): { info: ProviderInfo | undefined; id: string } {
  const known = getProvider(eventId);
  const info = visibleProviders.find((p) => p.id === known?.id) ?? known;
  return { info, id: info?.id ?? eventId };
}

export function useProviderLoginEvents({
  active,
  visibleProviders,
  addToast,
  t,
  loadStatuses,
  patchAuthState,
  setLoginDialog,
  setPending,
}: Args): void {
  useEffect(() => {
    if (!active) return;
    const release = claimProviderLoginSurface();
    const off = subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type === "ProviderLoginUrl") {
        const { info: prov } = eventProvider(
          visibleProviders,
          ev.data.provider,
        );
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
            authCode: ev.data.auth_code,
          })
        ) {
          void tauriSystem.openUrl(ev.data.url, {
            failedTitle: t("toast.signInFailed", {
              provider: prov?.name ?? ev.data.provider,
            }),
            command: "provider_open_login_url",
          });
          return;
        }
        if (prov) {
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
        const { info: prov, id: providerId } = eventProvider(
          visibleProviders,
          ev.data.provider,
        );
        if (ev.data.success) {
          addToast({
            title: t("toast.signInSucceeded", {
              provider: prov?.name ?? ev.data.provider,
            }),
            variant: "success",
          });
          patchAuthState(providerId, true);
        } else if (ev.data.error) {
          addToast({
            title: t("toast.signInFailed", {
              provider: prov?.name ?? ev.data.provider,
            }),
            description: localizedProviderLoginError(ev.data.error),
            variant: "error",
          });
        }
        setLoginDialog((current) =>
          current?.provider.id === providerId ? null : current,
        );
        setPending((current) => (current?.id === providerId ? null : current));
        loadStatuses();
      }
    });
    return () => {
      off();
      release();
    };
  }, [
    active,
    visibleProviders,
    addToast,
    t,
    loadStatuses,
    patchAuthState,
    setLoginDialog,
    setPending,
  ]);
}
