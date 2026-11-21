import { useEffect, useState } from "react";
import {
  confirmedConnectedProviders,
  connectedProviderIds,
} from "../lib/connected-providers";
import { logAndReportError } from "../lib/error-report";
import { type KickoffPin, kickoffPinFromScan } from "../lib/kickoff-pin";
import { tauriProvider } from "../lib/tauri";
import {
  type ProviderStatusScan,
  useProviderStatuses,
} from "./use-provider-statuses";

interface LastUsed {
  provider: string | null;
  model: string | null;
}

export function useKickoffPinResolver(
  active = true,
): () => Promise<KickoffPin> {
  const providerScan = useProviderStatuses();
  const [lastUsed, setLastUsed] = useState<LastUsed | null>(null);

  useEffect(() => {
    if (!active) {
      setLastUsed(null);
      return;
    }
    let cancelled = false;
    tauriProvider
      .getLastUsed()
      .then((pair) => {
        if (!cancelled) setLastUsed(pair);
      })
      .catch((err: unknown) => logAndReportError("kickoff_pin_last_used", err));
    return () => {
      cancelled = true;
    };
  }, [active]);

  return async () => {
    const decide = (scan: ProviderStatusScan): KickoffPin | null =>
      kickoffPinFromScan({
        connected: connectedProviderIds(confirmedConnectedProviders(scan)),
        lastUsedProvider: lastUsed?.provider,
        lastUsedModel: lastUsed?.model,
      });
    return decide(providerScan) ?? decide(await providerScan.refetch()) ?? {};
  };
}
