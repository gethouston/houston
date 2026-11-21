import type { TriggerType } from "@houston/engine-adapter";
import type { TriggerApp } from "@houston-ai/routines";
import { useMemo, useState } from "react";
import { useTriggerTypes } from "../../../hooks/queries/use-triggers";
import type { ConnectableApp } from "../use-usable-toolkits";
import type { TriggerEventOption, TriggerPick } from "./types";

export type TriggerPhase = "app" | "connect" | "selected";

export interface SelectedApp {
  toolkit: string;
  name: string;
  logoUrl?: string;
}

function toEventOptions(types: TriggerType[]): TriggerEventOption[] {
  return types.map((t) => ({
    slug: t.slug,
    name: t.name,
    ...(t.description ? { description: t.description } : {}),
    ...(t.config ? { configSchema: t.config } : {}),
  }));
}

export function useTriggerStep(apps: TriggerApp[]) {
  const [phase, setPhase] = useState<TriggerPhase>("app");
  const [selected, setSelected] = useState<SelectedApp | null>(null);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);

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

  const onConnected = () => {
    setAccountId(undefined);
    setPhase("selected");
  };

  const backToApps = () => {
    setSelected(null);
    setAccountId(undefined);
    setPhase("app");
  };

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
