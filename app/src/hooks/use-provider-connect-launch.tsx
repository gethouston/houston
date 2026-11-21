import { type ReactNode, useCallback, useState } from "react";
import { ReconnectDialog } from "../components/shell/provider-error-cards/reconnect-dialog";
import { reconnectSurface } from "../components/shell/provider-error-cards/reconnect-surface";
import { getProvider } from "../lib/providers";
import { tauriProvider } from "../lib/tauri";

export interface ProviderConnectLaunch {
  connect: () => void;
  launching: boolean;
  dialog: ReactNode;
}

export function useProviderConnectLaunch(
  providerId: string,
): ProviderConnectLaunch {
  const [open, setOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const surface = reconnectSurface(providerId, getProvider(providerId)?.auth);

  const connect = useCallback(() => {
    if (surface !== "oauth_login") {
      setOpen(true);
      return;
    }
    setLaunching(true);
    void (async () => {
      try {
        await tauriProvider.launchLogin(providerId);
      } catch {
      } finally {
        setLaunching(false);
      }
    })();
  }, [providerId, surface]);

  return {
    connect,
    launching,
    dialog:
      surface === "oauth_login" ? null : (
        <ReconnectDialog
          surface={surface}
          providerId={providerId}
          open={open}
          onClose={() => setOpen(false)}
        />
      ),
  };
}
