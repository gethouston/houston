import { useRef, useState } from "react";
import {
  closeMeansCancel,
  type ProviderConnectDialogClose,
} from "../../lib/provider-connect-dialog-close";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderCopilotConnectDialog } from "./provider-copilot-connect-dialog";

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
        close("completed");
        run?.(domain);
      }}
    />
  );

  return { begin, dialog, open: dialogProvider !== null };
}
