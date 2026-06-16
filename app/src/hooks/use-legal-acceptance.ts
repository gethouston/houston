import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { LEGAL_ACCEPTANCE_KEY, type LegalAcceptance } from "@houston-ai/engine-client";

import { tauriPreferences } from "../lib/tauri";
import { CURRENT_DISCLAIMER_VERSION } from "../lib/legal";

const queryKey = ["legal-acceptance"] as const;

function parseAcceptance(raw: string | null): LegalAcceptance | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as LegalAcceptance).version === "number" &&
      typeof (parsed as LegalAcceptance).acceptedAt === "string"
    ) {
      return parsed as LegalAcceptance;
    }
  } catch (err) {
    // Corrupt / legacy shape — surface to the console so we notice, then
    // fall through and treat the user as not-yet-accepted. The gate will
    // simply re-prompt.
    console.warn("[legal-acceptance] failed to parse persisted value:", err);
  }
  return null;
}

export interface LegalAcceptanceState {
  /** True once the user has accepted at least the current disclaimer version. */
  isAccepted: boolean;
  /** True while the initial preference fetch is in flight. Render nothing during this. */
  isLoading: boolean;
  /** Write acceptance to engine prefs and invalidate the cached query. */
  accept: () => Promise<void>;
  /** Close the Houston window. Called when the user clicks Decline. */
  decline: () => Promise<void>;
}

/**
 * React hook that drives the security disclaimer gate.
 *
 * The acceptance record lives in engine preferences under
 * `"legal_acceptance"` so it survives app reinstall-in-place and syncs
 * across any surface that shares the same `~/.houston` DB. We treat the
 * user as accepted iff the persisted `version` is at least
 * `CURRENT_DISCLAIMER_VERSION` — bumping that constant forces every
 * user to re-accept.
 */
export function useLegalAcceptance(): LegalAcceptanceState {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<LegalAcceptance | null> => {
      const raw = await tauriPreferences.get(LEGAL_ACCEPTANCE_KEY);
      return parseAcceptance(raw);
    },
    // Preferences rarely change from other surfaces during a session.
    // A short stale window is still helpful if the user re-focuses the
    // window after accepting on another device.
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const record: LegalAcceptance = {
        version: CURRENT_DISCLAIMER_VERSION,
        acceptedAt: new Date().toISOString(),
      };
      await tauriPreferences.set(LEGAL_ACCEPTANCE_KEY, JSON.stringify(record));
      return record;
    },
    onSuccess: (record) => {
      qc.setQueryData<LegalAcceptance | null>(queryKey, record);
    },
  });

  const accept = useCallback(async () => {
    await mutation.mutateAsync();
  }, [mutation]);

  const decline = useCallback(async () => {
    // Close the current Tauri window. Throws if the IPC bridge is unavailable —
    // we let it propagate so the caller can surface a toast; a silent
    // no-op here would trap the user on the gate.
    await getCurrentWindow().close();
  }, []);

  const accepted = query.data;
  const isAccepted =
    accepted !== null && accepted !== undefined &&
    accepted.version >= CURRENT_DISCLAIMER_VERSION;

  return {
    isAccepted,
    isLoading: query.isLoading,
    accept,
    decline,
  };
}
