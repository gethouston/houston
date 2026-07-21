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

  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current) return;
    if (chosen && isToolkitConnected(connections.data, chosen.toolkit)) {
      handedOff.current = true;
      onConnected(chosen.toolkit, chosen.label);
    }
  }, [chosen, connections.data, onConnected]);

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

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.connectEmail.title")}
      subtitle={t("tutorial.missions.connectEmail.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-md flex-col gap-2">
          <EmailProviderRow
            display={displayFor("gmail", "Gmail")}
            connected={isToolkitConnected(connections.data, "gmail")}
            loading={isLoading("gmail")}
            disabled={disabledExcept("gmail")}
            labels={labels}
            onConnect={() => startConnect("gmail", "Gmail")}
            onCancel={() => tryCancel("gmail")}
          />
          <EmailProviderRow
            display={displayFor("outlook", "Outlook")}
            connected={isToolkitConnected(connections.data, "outlook")}
            loading={isLoading("outlook")}
            disabled={disabledExcept("outlook")}
            labels={labels}
            onConnect={() => startConnect("outlook", "Outlook")}
            onCancel={() => tryCancel("outlook")}
          />
        </div>
      </div>
    </SetupCard>
  );
}
