import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { tryBeginCodexLoopbackLogin } from "../../lib/codex-loopback";
import { subscribeHoustonEvents } from "../../lib/events";
import { osIsTauri } from "../../lib/os-bridge";
import { getProvider, type ProviderInfo } from "../../lib/providers";
import { tauriSystem } from "../../lib/tauri";
import { ProviderLoginDialog } from "./provider-login-dialog";
import {
  providerLoginFallbackAction,
  providerLoginSurfaceClaimed,
} from "./provider-login-surface";

interface FallbackDialogState {
  provider: ProviderInfo;
  url: string;
  userCode: string | null;
  instructions?: string | null;
}

export function ProviderLoginFallback() {
  const { t } = useTranslation("providers");
  const [dialog, setDialog] = useState<FallbackDialogState | null>(null);

  useEffect(() => {
    return subscribeHoustonEvents((ev: HoustonEvent) => {
      if (ev.type === "ProviderLoginUrl") {
        const claimed = providerLoginSurfaceClaimed();
        if (
          !claimed &&
          tryBeginCodexLoopbackLogin({
            provider: ev.data.provider,
            url: ev.data.url,
            userCode: ev.data.user_code,
          })
        ) {
          return;
        }
        const action = providerLoginFallbackAction({
          claimed,
          isDesktop: osIsTauri(),
          userCode: ev.data.user_code,
          authCode: ev.data.auth_code,
        });
        if (action === "ignore") return;
        const prov = getProvider(ev.data.provider);
        if (action === "open") {
          void tauriSystem.openUrl(ev.data.url, {
            failedTitle: t("toast.signInFailed", {
              provider: prov?.name ?? ev.data.provider,
            }),
            command: "provider_login_open_url",
          });
          return;
        }
        if (prov) {
          setDialog((current) => ({
            provider: prov,
            url: ev.data.url,
            userCode:
              ev.data.user_code ??
              (current?.provider.id === prov.id ? current.userCode : null),
            instructions: ev.data.instructions,
          }));
        }
        return;
      }
      if (ev.type === "ProviderLoginComplete") {
        const completed = getProvider(ev.data.provider)?.id ?? ev.data.provider;
        setDialog((current) =>
          current?.provider.id === completed ? null : current,
        );
      }
    });
  }, [t]);

  if (!dialog) return null;
  return (
    <ProviderLoginDialog
      provider={dialog.provider}
      url={dialog.url}
      userCode={dialog.userCode}
      instructions={dialog.instructions ?? null}
      onClose={() => setDialog(null)}
    />
  );
}
