/**
 * "Connect <provider>" for a surface that is NOT the AI Hub — the routine
 * screen's health badge (PRODUCT-1475).
 *
 * It owns no connect flow of its own: which surface a provider connects through
 * is the same routing the in-chat auth card uses (`reconnectSurface` →
 * `ReconnectDialog` for api-key / local providers, `launchLogin` for OAuth), so
 * an api-key provider is never sent through a browser sign-in it would 400 on
 * (HOU-1077). The caller renders {@link ProviderConnectLaunch.dialog}.
 *
 * Completion is not awaited: `launchLogin` resolves when the engine STARTS
 * sign-in, and the real answer arrives later as `ProviderLoginComplete`, which
 * invalidates the provider-status query the badge reads — so the badge flips
 * itself with no listener here.
 */

import { type ReactNode, useCallback, useState } from "react";
import { ReconnectDialog } from "../components/shell/provider-error-cards/reconnect-dialog";
import { reconnectSurface } from "../components/shell/provider-error-cards/reconnect-surface";
import { getProvider } from "../lib/providers";
import { tauriProvider } from "../lib/tauri";

export interface ProviderConnectLaunch {
  /** Start the connect. Opens a dialog or launches the browser sign-in. */
  connect: () => void;
  /** A browser sign-in is being launched (the button spins). */
  launching: boolean;
  /** The api-key / local-endpoint dialog, when this provider connects that way. */
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
        // `launchLogin` routes through `call()`, which has already surfaced AND
        // reported this failure exactly once. A second toast here would
        // double-surface the same event; there is nothing left to add.
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
