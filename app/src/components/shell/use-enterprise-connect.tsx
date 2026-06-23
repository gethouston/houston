import { useRef, useState } from "react";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderEnterpriseDialog } from "./provider-enterprise-dialog";

/**
 * Shared GitHub Copilot Enterprise connect step. The Enterprise card must collect
 * the company GitHub domain BEFORE login (the device-code flow is domain-specific),
 * and several surfaces start logins (the provider picker, settings) — so the
 * dialog lives here once, not duplicated per surface.
 *
 * `begin(provider, run)` returns true and opens the dialog for an Enterprise
 * provider, deferring `run(domain)` until the user submits. It returns false for
 * everything else, so the caller proceeds with its normal no-domain login. Render
 * the returned `dialog` once in the surface.
 */
export function useEnterpriseConnect() {
  const [dialogProvider, setDialogProvider] = useState<ProviderInfo | null>(
    null,
  );
  const deferred = useRef<((enterpriseDomain: string) => void) | null>(null);

  const begin = (
    provider: ProviderInfo,
    run: (enterpriseDomain: string) => void,
  ): boolean => {
    if (!provider.enterprise) return false;
    deferred.current = run;
    setDialogProvider(provider);
    return true;
  };

  const dialog = (
    <ProviderEnterpriseDialog
      provider={dialogProvider}
      onClose={() => {
        deferred.current = null;
        setDialogProvider(null);
      }}
      onConnect={(domain) => {
        const run = deferred.current;
        deferred.current = null;
        setDialogProvider(null);
        run?.(domain);
      }}
    />
  );

  return { begin, dialog };
}
