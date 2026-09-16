/**
 * Provider + model defaulting for the import flow.
 *
 * The pair resolves twice: the sticky last-used pair lands first as a
 * non-blocking fallback while provider statuses are still unknown, then again
 * against confirmed connections once those statuses arrive. A model the user
 * picked by hand outranks both; which pair is worth PERSISTING onto the new
 * agent is decided in `import-kickoff-pin.ts`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { pickDefaultProviderModel } from "../../lib/default-provider-model";
import { providerIsConnected } from "../../lib/provider-connection";
import { getDefaultModel } from "../../lib/providers";
import { tauriProvider } from "../../lib/tauri";
import type { KickoffPin } from "./import-install-request";
import { resolveKickoffPin } from "./import-kickoff-pin";

export interface ImportProviderModel {
  provider: string;
  model: string;
  onProviderChange: (provider: string, model: string) => void;
  /** Clear the sticky-preference bookkeeping; provider/model themselves stay. */
  resetPreference: () => void;
  resolveKickoffPin: () => KickoffPin;
}

export function useImportProviderModel(open: boolean): ImportProviderModel {
  const [provider, setProvider] = useState<string>("anthropic");
  const [model, setModel] = useState<string>(getDefaultModel("anthropic"));
  const [lastUsed, setLastUsed] = useState<{
    provider: string | null;
    model: string | null;
  } | null>(null);
  const userPickedModelRef = useRef(false);
  const { statuses: providerStatuses } = useProviderStatuses();
  const connectedProviders = useMemo(
    () =>
      Object.values(providerStatuses)
        .filter((status) => providerIsConnected(status))
        .map((status) => status.provider),
    [providerStatuses],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    tauriProvider.getLastUsed().then(({ provider: p, model: m }) => {
      if (cancelled) return;
      setLastUsed({ provider: p, model: m });
      if (!userPickedModelRef.current && p) {
        setProvider(p);
        setModel(m ?? getDefaultModel(p));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || userPickedModelRef.current) return;
    if (Object.keys(providerStatuses).length === 0) return;
    const next = pickDefaultProviderModel({
      lastUsedProvider: lastUsed?.provider,
      lastUsedModel: lastUsed?.model,
      connectedProviders,
    });
    setProvider(next.provider);
    setModel(next.model);
  }, [connectedProviders, lastUsed, open, providerStatuses]);

  const onProviderChange = useCallback(
    (nextProvider: string, nextModel: string) => {
      userPickedModelRef.current = true;
      setProvider(nextProvider);
      setModel(nextModel);
    },
    [],
  );

  const resetPreference = useCallback(() => {
    setLastUsed(null);
    userPickedModelRef.current = false;
  }, []);

  const resolveCurrentPin = useCallback(
    (): KickoffPin =>
      resolveKickoffPin({
        userPickedModel: userPickedModelRef.current,
        provider,
        model,
        lastUsedProvider: lastUsed?.provider,
        lastUsedModel: lastUsed?.model,
        connectedProviders,
      }),
    [connectedProviders, lastUsed, model, provider],
  );

  return {
    provider,
    model,
    onProviderChange,
    resetPreference,
    resolveKickoffPin: resolveCurrentPin,
  };
}
