import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useIntegrationConnections,
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import type { Agent } from "../../../lib/types";
import { INTEGRATION_PROVIDER, useConnectFlow } from "../../integrations";
import { type AppDisplay, fallbackLogo } from "../../integrations/app-display";
import { SetupCard } from "../setup-card";
import { EmailProviderRow } from "./email-provider-row";
import { isToolkitConnected } from "./onboarding-flow";

/** Ignore a second click immediately after OAuth begins. */
const CANCEL_GUARD_MS = 300;

/** The email providers this step offers, in display order. */
const EMAIL_PROVIDERS = [
  { toolkit: "gmail", label: "Gmail" },
  { toolkit: "outlook", label: "Outlook" },
] as const;

interface ConnectEmailMissionProps {
  eyebrow: string;
  /** The agent created in the previous step, connect is scoped to it. */
  agent: Agent;
  onBack: () => void;
  /** Fires once the chosen email toolkit is connected and active. */
  onConnected: (toolkit: string, label: string) => void;
}

/**
 * Give the agent access to email through one of two direct OAuth actions. This
 * step intentionally has no exit path: the first live email message is the
 * onboarding proof point, and its conversation owns the only later exit.
 */
export function ConnectEmailMission({
  eyebrow,
  agent,
  onBack,
  onConnected,
}: ConnectEmailMissionProps) {
  const { t } = useTranslation("setup");
  const [chosen, setChosen] = useState<{
    toolkit: string;
    label: string;
  } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    ready || attempted,
  );

  // Real app logos from the toolkit catalog (the hook self-gates on the
  // provider being registered, so it stays idle where Composio is absent).
  const toolkits = useIntegrationToolkits(INTEGRATION_PROVIDER, true);
  const displayFor = useCallback(
    (toolkit: string, name: string): AppDisplay => {
      const logoUrl = (toolkits.data ?? []).find(
        (tk) => tk.slug === toolkit,
      )?.logoUrl;
      return {
        toolkit,
        name,
        description: "",
        logoUrl: logoUrl || fallbackLogo(toolkit),
      };
    },
    [toolkits.data],
  );

  const { states, connect, cancel } = useConnectFlow({ agentId: agent.id });
  // One-at-a-time by design: this step offers a single email provider, so any
  // live flow dims the other row (the per-slug flow could run both at once).
  const connecting = Object.keys(states).length > 0;

  // Single hand-off gate: the auto-advance effect and the explicit Continue
  // button both route through here, so the step advances exactly once no matter
  // which fires first (a manual connect landing as the effect runs, say).
  const handedOff = useRef(false);
  const advance = useCallback(
    (toolkit: string, label: string) => {
      if (handedOff.current) return;
      handedOff.current = true;
      onConnected(toolkit, label);
    },
    [onConnected],
  );

  // Advance the moment a relevant email connection is active — whether the user
  // just connected it here (`chosen`) OR it was ALREADY connected when the step
  // opened (a returning user). Gate on `connections.data` being resolved: an
  // empty array is "resolved, none connected"; `undefined` is still loading, and
  // advancing then would flash-skip the step before we know the truth.
  useEffect(() => {
    if (handedOff.current || !connections.data) return;
    const active =
      (chosen && isToolkitConnected(connections.data, chosen.toolkit)
        ? chosen
        : undefined) ??
      EMAIL_PROVIDERS.find((p) =>
        isToolkitConnected(connections.data, p.toolkit),
      );
    if (active) advance(active.toolkit, active.label);
  }, [chosen, connections.data, advance]);

  const busyRef = useRef(false);
  const startedAtRef = useRef(0);
  const startConnect = useCallback(
    (toolkit: string, label: string) => {
      if (busyRef.current) return;
      setChosen({ toolkit, label });
      setAttempted(true);
      if (isToolkitConnected(connections.data, toolkit)) return;
      busyRef.current = true;
      startedAtRef.current = Date.now();
      void Promise.resolve(connect(toolkit)).finally(() => {
        busyRef.current = false;
      });
    },
    [connect, connections.data],
  );

  const tryCancel = useCallback(
    (toolkit: string) => {
      if (Date.now() - startedAtRef.current < CANCEL_GUARD_MS) return;
      cancel(toolkit);
    },
    [cancel],
  );

  const labels = {
    connect: t("tutorial.missions.connectEmail.connect"),
    connecting: t("tutorial.missions.connectEmail.connecting"),
    cancel: t("tutorial.missions.connectEmail.cancel"),
    connected: t("tutorial.missions.connectEmail.connected"),
  };
  const isLoading = (toolkit: string) => toolkit in states;
  const disabledExcept = (toolkit: string) =>
    connecting && !(toolkit in states);

  // Belt and braces: whenever a row is Connected, offer an explicit Continue so
  // the user is never stranded even if the auto-advance above misses an edge.
  const connected = EMAIL_PROVIDERS.find((p) =>
    isToolkitConnected(connections.data, p.toolkit),
  );

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.connectEmail.title")}
      subtitle={t("tutorial.missions.connectEmail.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
      onNext={
        connected
          ? () => advance(connected.toolkit, connected.label)
          : undefined
      }
      nextLabel={t("tutorial.nav.continue")}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-md flex-col gap-2">
          {EMAIL_PROVIDERS.map((p) => (
            <EmailProviderRow
              key={p.toolkit}
              display={displayFor(p.toolkit, p.label)}
              connected={isToolkitConnected(connections.data, p.toolkit)}
              loading={isLoading(p.toolkit)}
              disabled={disabledExcept(p.toolkit)}
              labels={labels}
              onConnect={() => startConnect(p.toolkit, p.label)}
              onCancel={() => tryCancel(p.toolkit)}
            />
          ))}
        </div>
      </div>
    </SetupCard>
  );
}
