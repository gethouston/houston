import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { subscribeHoustonEvents } from "../../lib/events";
import { osIsTauri } from "../../lib/os-bridge";
import { PROVIDERS, type ProviderInfo } from "../../lib/providers";
import { tauriSystem } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { ProviderLoginDialog } from "./provider-login-dialog";
import {
  providerLoginFallbackAction,
  providerLoginSurfaceClaimed,
} from "./provider-login-surface";

interface FallbackDialogState {
  provider: ProviderInfo;
  url: string;
  userCode: string | null;
}

/**
 * Shell-global consumer of last resort for `ProviderLoginUrl` (HOU-676).
 *
 * A sign-in launched from a surface WITHOUT its own login handler — the
 * in-chat reconnect card, the store-driven card — used to emit the OAuth URL
 * into the void: the runtime had started the flow, but nothing opened the
 * browser, so the button read as dead. Mounted once in the shell, this acts
 * exactly like the dedicated handlers (open the browser for a desktop
 * loopback flow, show the dialog for device-code / remote flows) and stands
 * down whenever a dedicated surface holds the claim
 * (`provider-login-surface.ts`).
 */
export function ProviderLoginFallback() {
  const { t } = useTranslation("providers");
  const addToast = useUIStore((s) => s.addToast);
  const [dialog, setDialog] = useState<FallbackDialogState | null>(null);

  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type === "ProviderLoginUrl") {
        const action = providerLoginFallbackAction({
          claimed: providerLoginSurfaceClaimed(),
          isDesktop: osIsTauri(),
          userCode: ev.data.user_code,
        });
        if (action === "ignore") return;
        const prov = PROVIDERS.find((p) => p.id === ev.data.provider);
        if (action === "open") {
          // Desktop loopback flow: pi's in-process callback server finishes
          // the exchange; the client only opens the URL. Surface a failed
          // open — the launching card sits in "waiting" otherwise.
          tauriSystem.openUrl(ev.data.url).catch((err) => {
            addToast({
              title: t("toast.signInFailed", {
                provider: prov?.name ?? ev.data.provider,
              }),
              description: err instanceof Error ? err.message : String(err),
              variant: "error",
            });
          });
          return;
        }
        if (prov) {
          // Device-code / remote flow: show the dialog. Keep a code already
          // shown if a later URL-only frame arrives for the same provider
          // (codex's device flow can emit twice).
          setDialog((current) => ({
            provider: prov,
            url: ev.data.url,
            userCode:
              ev.data.user_code ??
              (current?.provider.id === prov.id ? current.userCode : null),
          }));
        }
        return;
      }
      if (ev.type === "ProviderLoginComplete") {
        // Only clear a dialog showing THIS provider — a completion for a
        // different provider must not clobber an in-flight sign-in.
        setDialog((current) =>
          current?.provider.id === ev.data.provider ? null : current,
        );
      }
    });
  }, [addToast, t]);

  if (!dialog) return null;
  return (
    <ProviderLoginDialog
      provider={dialog.provider}
      url={dialog.url}
      userCode={dialog.userCode}
      onClose={() => setDialog(null)}
    />
  );
}
