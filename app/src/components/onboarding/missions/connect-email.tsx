import { AsyncButton, Button, Input } from "@houston-ai/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useIntegrationConnections,
  useIntegrationStatus,
} from "../../../hooks/queries";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { canManageAgentGrants } from "../../../lib/org-roles";
import type { Agent } from "../../../lib/types";
import { INTEGRATION_PROVIDER } from "../../tabs/integrations-tab-model";
import { useIntegrationConnect } from "../../tabs/use-integration-connect";
import { OptionCard, SetupCard } from "../setup-card";
import { isToolkitConnected, shouldOfferConnectSkip } from "./onboarding-flow";

interface ConnectEmailMissionProps {
  eyebrow: string;
  /** The agent created in the previous step — connect is scoped to it. */
  agent: Agent;
  onBack: () => void;
  /** Fires once the chosen email toolkit is connected and active. */
  onConnected: (toolkit: string, label: string) => void;
  /** Escape hatch for a dead end (gateway unready, OAuth failed): skip the
   *  email steps rather than strand first-run with no way forward. */
  onSkip: () => void;
}

/**
 * Onboarding: give the agent access to the user's email. Pick Gmail, Outlook,
 * or another provider and connect it through the app's own OAuth on the
 * integrations provider (platform mode — no Composio account, no sign-in step;
 * see `integrations-tab-model.ts`). `useIntegrationConnect` mints the hosted
 * link, opens the browser, and polls until the connection turns active; we then
 * hand off the moment the chosen toolkit shows up connected.
 */
export function ConnectEmailMission({
  eyebrow,
  agent,
  onBack,
  onConnected,
  onSkip,
}: ConnectEmailMissionProps) {
  const { t } = useTranslation("setup");
  const { capabilities } = useCapabilities();
  const [sel, setSel] = useState<"gmail" | "outlook" | "other" | null>(null);
  const [other, setOther] = useState("");
  // Once the user has kicked off a connect, keep the detection query enabled
  // regardless of the cached ready flag: `useIntegrationConnect` invalidates
  // it when its OAuth poll resolves, and we must refetch to see the new
  // connection even if the status cache still lags on `ready`.
  const [attempted, setAttempted] = useState(false);

  // The gateway is "ready" only once it has the Houston session (App's session
  // sync pushes it). Gate the connection poll on it so we never fire a failing
  // call while the provider is still warming up (before any connect attempt).
  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    ready || attempted,
  );

  // Multiplayer: a connection made from this agent's flow is auto-granted to it
  // (mirrors the integrations tab). Single-player has no grants — this is false.
  const autoGrant = canManageAgentGrants(capabilities, agent);
  const { connectingToolkit, connect } = useIntegrationConnect({
    agentId: agent.id,
    autoGrant,
  });

  const chosen = useMemo(() => {
    if (sel === "gmail") return { toolkit: "gmail", label: "Gmail" };
    if (sel === "outlook") return { toolkit: "outlook", label: "Outlook" };
    if (sel === "other" && other.trim()) {
      return { toolkit: other.trim().toLowerCase(), label: other.trim() };
    }
    return null;
  }, [sel, other]);

  // Advance the moment the chosen toolkit lands active. `useIntegrationConnect`
  // invalidates the connections query when its OAuth poll resolves, so the
  // refetch drives this. Guarded by a ref so the hand-off fires exactly once.
  const handedOff = useRef(false);
  useEffect(() => {
    if (handedOff.current) return;
    if (chosen && isToolkitConnected(connections.data, chosen.toolkit)) {
      handedOff.current = true;
      onConnected(chosen.toolkit, chosen.label);
    }
  }, [chosen, connections.data, onConnected]);

  // Return the promise so AsyncButton's in-flight guard engages for the whole
  // OAuth hop + poll — `void`ing it would leave the rage-click window open
  // (HOU-465) and let a double click mint two OAuth flows.
  const handleConnect = useCallback(() => {
    if (!chosen) return;
    setAttempted(true);
    return connect(chosen.toolkit);
  }, [chosen, connect]);

  // Dead-end escape: the route can exist (capabilities) while the gateway is
  // unready or the OAuth hop failed; without a skip the first-run has no
  // Continue and the user is stranded (they can always connect later from the
  // Integrations tab).
  const showSkip = shouldOfferConnectSkip({
    statusKnown: !status.isPending,
    ready,
    attempted,
    connecting: connectingToolkit !== null,
  });

  return (
    <SetupCard
      eyebrow={eyebrow}
      title={t("tutorial.missions.connectEmail.title")}
      subtitle={t("tutorial.missions.connectEmail.body")}
      onBack={onBack}
      backLabel={t("tutorial.nav.back")}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <div className="flex w-full max-w-sm flex-col gap-2">
          <OptionCard
            label="Gmail"
            selected={sel === "gmail"}
            onSelect={() => setSel("gmail")}
          />
          <OptionCard
            label="Outlook"
            selected={sel === "outlook"}
            onSelect={() => setSel("outlook")}
          />
          <OptionCard
            label={t("tutorial.missions.connectEmail.other")}
            selected={sel === "other"}
            onSelect={() => setSel("other")}
          />
          {sel === "other" && (
            <Input
              autoFocus
              value={other}
              placeholder={t("tutorial.missions.connectEmail.otherPlaceholder")}
              className="rounded-xl"
              onChange={(e) => setOther(e.target.value)}
            />
          )}
        </div>
        <AsyncButton
          className="h-11 rounded-full px-5"
          spinner={false}
          disabled={!chosen || connectingToolkit !== null}
          onClick={handleConnect}
        >
          {connectingToolkit
            ? t("tutorial.missions.connectEmail.connecting")
            : t("tutorial.missions.connectEmail.connect")}
        </AsyncButton>
        {showSkip && (
          <div className="flex items-center justify-center gap-3">
            <p className="min-w-0 text-xs text-muted-foreground">
              {t("tutorial.missions.connectEmail.skipHint")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={onSkip}
            >
              {t("tutorial.missions.connectEmail.skip")}
            </Button>
          </div>
        )}
      </div>
    </SetupCard>
  );
}
