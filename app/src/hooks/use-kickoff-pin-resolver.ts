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

/**
 * The provider/model pin for a newly hired AI Employee, shared by every hiring
 * surface (the create dialog and the onboarding team card): the last-used pair
 * when a connection confirms it, else the first connected provider, and
 * nothing at all when no scan can confirm one.
 *
 * The shared status query is cached and the AI hub's sign-out repaints only
 * its OWN rows, so a held scan can still name a provider the person has just
 * disconnected. An unconfirmable scan is therefore re-probed once before
 * deciding, and if the fresh one still cannot confirm a connection nothing is
 * pinned: the employee's first turn falls to whatever IS connected, or shows
 * the connect card.
 *
 * `active` scopes the last-used lookup to when the surface is on screen: it is
 * read each time `active` turns true and dropped when it turns false, so a
 * dialog reopened after a model switch never pins the stale pair.
 */
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
      // Hiring still works without it: the pin falls back to a connected
      // provider. Nothing to tell the person, but it must reach us.
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
