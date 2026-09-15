import { useRef, useState } from "react";
import {
  closeMeansCancel,
  type ProviderConnectDialogClose,
} from "../../lib/provider-connect-dialog-close";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderCopilotConnectDialog } from "./provider-copilot-connect-dialog";

/**
 * Shared GitHub Copilot connect step. Copilot is ONE card whose connect opens a
 * dialog to choose Personal (github.com) vs Company / GitHub Enterprise (which
 * collects the company GitHub domain). Several surfaces start logins (the picker,
 * settings), so the dialog lives here once, not duplicated per surface.
 *
 * `begin(provider, run)` returns true and opens the dialog for the Copilot card,
 * deferring `run(enterpriseDomain?)` until the user picks a plan — `undefined` =>
 * Personal/github.com, a domain string => Company. It returns false for every
 * other provider, so the caller proceeds with its normal no-domain login. Render
 * the returned `dialog` once in the surface.
 */
export function useCopilotConnect(onCancel?: () => void) {
  const [dialogProvider, setDialogProvider] = useState<ProviderInfo | null>(
    null,
  );
  const deferred = useRef<((enterpriseDomain?: string) => void) | null>(null);

  const begin = (
    provider: ProviderInfo,
    run: (enterpriseDomain?: string) => void,
  ): boolean => {
    if (!provider.copilotConnect) return false;
    deferred.current = run;
    setDialogProvider(provider);
    return true;
  };

  const close = (reason: ProviderConnectDialogClose) => {
    if (closeMeansCancel("copilot", reason)) onCancel?.();
    deferred.current = null;
    setDialogProvider(null);
  };

  const dialog = (
    <ProviderCopilotConnectDialog
      provider={dialogProvider}
      onClose={() => close("dismissed")}
      onConnect={(domain) => {
        const run = deferred.current;
        // Picking a plan STARTS the sign-in, so this close is progress, never
        // an abandon: `closeMeansCancel` keeps the observation alive for it.
        close("completed");
        run?.(domain);
      }}
    />
  );

  return { begin, dialog, open: dialogProvider !== null };
}
