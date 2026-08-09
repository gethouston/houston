import type { TriggerType } from "@houston-ai/engine-client";
import type { TriggerApp } from "@houston-ai/routines";
import { useMemo, useState } from "react";
import { useTriggerTypes } from "../../../hooks/queries/use-triggers";
import type { ConnectableApp } from "../use-usable-toolkits";
import type { TriggerEventOption, TriggerPick } from "./types";

/** Which sub-view the trigger step body is showing. */
export type TriggerPhase = "app" | "connect" | "selected";

/** The app the user is building the trigger on (display-only identity). */
export interface SelectedApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
}

/** Map a toolkit's raw trigger catalog to the slim options the setup chat reads:
 *  slug + human name + description + the raw config schema (opaque here). */
function toEventOptions(types: TriggerType[]): TriggerEventOption[] {
  return types.map((t) => ({
    slug: t.slug,
    name: t.name,
    ...(t.description ? { description: t.description } : {}),
    ...(t.config ? { configSchema: t.config } : {}),
  }));
}

/**
 * The trigger step's state machine: pick an app → (connect it) → the app is
 * selected. Picking WHICH event and its filters is NO LONGER done here — the
 * setup chat decides that in plain words. This step only resolves the app's
 * identity, pins the account when the app has more than one, and fetches the
 * app's event catalog in the background so the pick can carry it to the chat.
 * The primary CTA gates on that catalog having loaded (a fetch failure surfaces
 * an inline retry — never a silent empty pick).
 */
export function useTriggerStep(apps: TriggerApp[]) {
  const [phase, setPhase] = useState<TriggerPhase>("app");
  const [selected, setSelected] = useState<SelectedApp | null>(null);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

  // Fetch the chosen app's event catalog in the background once it is selected.
  // The CTA waits on this so the pick always carries a catalog to the chat.
  const types = useTriggerTypes(
    phase === "selected" ? (selected?.toolkit ?? null) : null,
    phase === "selected",
  );
  const events = useMemo<TriggerEventOption[]>(
    () => toEventOptions(types.data ?? []),
    [types.data],
  );
  const catalogLoaded = types.isSuccess;
  const catalogError = types.isError;

  // The connected TriggerApp (with accounts) whose account we may need to pin.
  // Falls back to an account-less identity while a just-connected app refetches.
  const eventApp: TriggerApp | null = useMemo(() => {
    if (!selected) return null;
    return (
      apps.find((a) => a.toolkit === selected.toolkit) ?? {
        toolkit: selected.toolkit,
        name: selected.name,
        logoUrl: selected.logoUrl,
        accounts: [],
      }
    );
  }, [apps, selected]);

  const pickConnected = (app: TriggerApp) => {
    setSelected({ toolkit: app.toolkit, name: app.name, logoUrl: app.logoUrl });
    setAccountId(undefined);
    setPhase("selected");
  };

  const pickConnectable = (app: ConnectableApp) => {
    setSelected({ toolkit: app.toolkit, name: app.name, logoUrl: app.logoUrl });
    setAccountId(undefined);
    setPhase("connect");
  };

  // The inline connect landed: the app is now selected (its connection refetch
  // has been triggered by the connect flow), so its catalog can load.
  const onConnected = () => {
    setAccountId(undefined);
    setPhase("selected");
  };

  const backToApps = () => {
    setSelected(null);
    setAccountId(undefined);
    setPhase("app");
  };

  // A multi-account app must have an account pinned; a single-account app needs
  // none (the server uses the only connection).
  const accountsOk =
    !eventApp || eventApp.accounts.length <= 1 || accountId !== undefined;
  const valid = phase === "selected" && catalogLoaded && accountsOk;

  const pick: TriggerPick | null =
    selected && catalogLoaded
      ? {
          kind: "trigger",
          toolkit: selected.toolkit,
          toolkitName: selected.name,
          events,
          ...(accountId ? { connectedAccountId: accountId } : {}),
        }
      : null;

  return {
    phase,
    selected,
    eventApp,
    accountId,
    catalogLoaded,
    catalogError,
    retryCatalog: () => void types.refetch(),
    valid,
    pick,
    pickConnected,
    pickConnectable,
    onConnected,
    backToApps,
    setAccountId,
  };
}
